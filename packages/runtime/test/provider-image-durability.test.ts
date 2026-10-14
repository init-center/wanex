import { createHash } from "node:crypto"
import * as childProcess from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import type { ProviderResponseCheckpoint } from "@wanex/protocol"
import { WanexAgentRunner } from "../src/execution/core/runner.js"
import { AgentRunnerExecutionContext } from "../src/execution/core/runner-context.js"
import { canonicalJson } from "../src/provider/replay.js"
import type { ProviderAdapter, ProviderEvent } from "../src/provider/types.js"
import { createStartedTurn } from "./durable-turn-test-fixture.js"
import { testModelEndpoint } from "./model-endpoint-fixture.js"
import { prepareProviderReplayResources } from "../src/resources/input.js"
import { AllowAllToolsPolicy, createToolRuntimeBinding, jsonToolResultContent, ToolRegistry } from "../src/tools/index.js"

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
const endpoint = testModelEndpoint({ endpointId: "images", protocolId: "fixture-image", providerId: "images",
  modelId: "images", inputModalities: ["text", "image"], outputModalities: ["text", "image"], features: [] })
let storage: StorageTestStore
let dir: string
const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
function openStore() {
  return createStorageTestStore({ kind: "local-system-service", mode: "persistent", storeDir: dir, serviceBin })
}
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "wanex-direct-image-")); storage = openStore() })
afterEach(async () => { vi.restoreAllMocks(); await storage.dispose(); await rm(dir, { recursive: true, force: true }) })

function imageProvider(count = 1): ProviderAdapter & { calls: number } {
  return { protocol: endpoint.protocol, providerId: "images", model: endpoint.model, outputModalities: ["text", "image"], calls: 0,
    buildReplayMessages() { return [] },
    async *stream(): AsyncIterable<ProviderEvent> {
      this.calls++
      yield { type: "text_delta", partId: "before", delta: "Before" }
      for (let i = 0; i < count; i++) {
        yield { type: "image_output", partId: `image_${i}`, mimeType: "image/png", bytes: png }
        yield { type: "text_delta", partId: `after_${i}`, delta: "After" }
      }
      yield { type: "usage", usage: { inputTokens: 3, outputTokens: 5 } }
      yield { type: "finish", reason: "stop" }
    } }
}
async function fixture(suffix: string) {
  return await createStartedTurn(storage, { suffix, modelEndpoint: endpoint })
}
async function checkpoint(f: Awaited<ReturnType<typeof fixture>>, provider = imageProvider()) {
  const context = new AgentRunnerExecutionContext({ session: f.session, provider })
  return await context.runProviderCompletion(() => context.buildReplayMessages(f.execution.sessionId), undefined, f.execution, 1, async () => {})
}
const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")

describe("durable direct conversation images", () => {
  it("publishes ordered resources and exact invocation provenance without a media operation", async () => {
    const f = await fixture("success")
    const provider = imageProvider(2)
    const observe = vi.fn()
    const result = await new WanexAgentRunner({ session: f.session, provider, observeProviderEvent: observe }).executeTurn({ execution: f.execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    const messages = await f.session.listMessages({ sessionId: f.execution.sessionId })
    expect(messages.at(-1)?.content.map((part) => part.type)).toEqual(["text", "resource", "text", "resource", "text"])
    const [invocation] = await storage.listProviderInvocations({ turnId: f.execution.turnId })
    expect(invocation).toMatchObject({ state: "succeeded", inputResources: [], outputObserved: true })
    expect(invocation?.responseDigest).toBe(digest(invocation?.responseCheckpoint))
    const sources = await storage.listResourceProvenance({ causeKind: "provider_output", causeId: invocation!.id })
    expect(sources).toHaveLength(2)
    expect(sources.map((source) => source.cause)).toEqual(expect.arrayContaining([
      { kind: "provider_output", invocationId: invocation!.id, partId: "image_0" },
      { kind: "provider_output", invocationId: invocation!.id, partId: "image_1" }
    ]))
    expect(await storage.listMediaGenerationOperations({})).toEqual([])
    expect(JSON.stringify(observe.mock.calls)).not.toContain(png.toString("base64"))
    expect(provider.calls).toBe(1)
  })

  it("recovers output_ready after killing the original native process with no provider or replay request", async () => {
    const f = await fixture("restart")
    const provider = imageProvider()
    const saved = await checkpoint(f, provider)
    await f.session.heartbeatJob({ ...f.execution, leaseMs: 1 })
    const child = ownedServiceProcess()
    if (child === undefined) throw new Error("owned native service process was not captured")
    const exited = once(child, "exit")
    expect(child.kill("SIGKILL")).toBe(true)
    await exited
    await storage.dispose()
    await delay(20)
    storage = openStore()
    const job = await storage.claimJob({ workerId: "new-owner", leaseMs: 60_000, kinds: ["session.turn"] })
    expect(job?.id).toBe(f.execution.jobId)
    const started = await storage.startSessionTurnAttempt({ ...f.execution, workerId: "new-owner", leaseToken: job!.leaseToken! })
    const { WanexSessionCore } = await import("../src/sessions/core.js")
    const session = new WanexSessionCore({ storage })
    const read = vi.spyOn(session, "listMessages")
    provider.stream = async function* () { throw new Error("must not regenerate"); yield { type: "finish", reason: "stop" } }
    const execution = { ...f.execution, workerId: "new-owner", leaseToken: job!.leaseToken!, attemptId: started.attempt.id }
    const result = await new WanexAgentRunner({ session, provider }).executeTurn({ execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    expect(read).toHaveBeenCalledTimes(1)
    expect(provider.calls).toBe(1)
    const invocation = (await storage.listProviderInvocations({ turnId: execution.turnId }))[0]!
    expect(invocation.attemptId).toBe(f.execution.attemptId)
    expect(invocation.responseCheckpoint).toEqual(saved.response)
    expect((await session.listMessages({ sessionId: execution.sessionId })).filter((message) => message.role === "assistant")).toHaveLength(1)
    expect(await storage.checkpointProviderInvocation({ ...f.execution, invocationId: invocation.id, response: saved.response, responseDigest: digest(saved.response) })).toBeNull()
  })

  it("keeps partial materialization unpublished and requires recovery", async () => {
    const f = await fixture("partial")
    const original = f.session.ingestResource.bind(f.session)
    vi.spyOn(f.session, "ingestResource").mockImplementationOnce(original).mockRejectedValueOnce(new Error("disk failure"))
    const provider = imageProvider(2)
    const grant = await storage.reserveBudget({ scope: { kind: "turn", ownerId: f.execution.turnId },
      limit: { tokens: 100 }, requested: { tokens: 100 }, principalId: f.execution.principalId,
      reason: "image-test", idempotencyKey: "image-budget" })
    const result = await new WanexAgentRunner({ session: f.session, provider }).executeTurn({
      execution: { ...f.execution, budgetGrantId: grant.id }, heartbeat: async () => {} })
    expect(result.outcome).toBe("recovery_required")
    expect(provider.calls).toBe(1)
    expect(await storage.listResources({})).toHaveLength(1)
    expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toEqual([])
    expect((await f.session.listMessages({ sessionId: f.execution.sessionId })).filter((message) => message.role === "assistant")).toEqual([])
    expect((await storage.listProviderInvocations({ turnId: f.execution.turnId }))[0]).toMatchObject({ state: "ambiguous" })
    expect(await storage.commitBudget({ grantId: grant.id })).toMatchObject({ committed: { tokens: 8 } })
  })

  it("requires explicit recovery after a native crash before the complete checkpoint", async () => {
    const f = await fixture("crash-before-ready")
    const provider = imageProvider()
    vi.spyOn(f.session, "checkpointProviderInvocation").mockImplementation(async () => {
      await f.session.heartbeatJob({ ...f.execution, leaseMs: 1 })
      const child = ownedServiceProcess()
      if (child === undefined) throw new Error("owned native service process was not captured")
      const exited = once(child, "exit")
      expect(child.kill("SIGKILL")).toBe(true)
      await exited
      throw new Error("native process killed before checkpoint")
    })
    await expect(checkpoint(f, provider)).rejects.toThrow("native process killed")
    await storage.dispose()
    await delay(20)
    storage = openStore()
    const job = await storage.claimJob({ workerId: "new-owner", leaseMs: 60_000, kinds: ["session.turn"] })
    expect(job).toBeNull()
    expect(await storage.getSessionTurn(f.execution.turnId)).toMatchObject({ state: "recovery_required" })
    expect(provider.calls).toBe(1)
    expect(await storage.listResources({})).toHaveLength(1)
    expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toEqual([])
    expect((await storage.listSessionMessages({ sessionId: f.execution.sessionId })).filter((message) => message.role === "assistant")).toEqual([])
  })

  it("uses the existing tool batch exactly once after a ready image and tool response", async () => {
    const modelEndpoint = { ...endpoint, model: { ...endpoint.model, features: ["tool_calling" as const] } }
    const f = await createStartedTurn(storage, { suffix: "image-tool", modelEndpoint })
    const provider = { ...imageProvider(), model: modelEndpoint.model }
    provider.stream = async function* (request): AsyncIterable<ProviderEvent> {
      this.calls++
      if (request.messages.some((message) => message.role === "tool")) {
        yield { type: "text_delta", partId: "final", delta: "done" }
        yield { type: "finish", reason: "stop" }
        return
      }
      yield { type: "image_output", partId: "image", mimeType: "image/png", bytes: png }
      yield { type: "tool_call_start", index: 0, toolCallId: "echo-call" }
      yield { type: "tool_call_delta", toolCallId: "echo-call", toolNameDelta: "echo", inputJsonDelta: "{}" }
      yield { type: "tool_call_end", toolCallId: "echo-call" }
      yield { type: "finish", reason: "tool_calls" }
    }
    const invoke = vi.fn(async (invocation: { toolCallId: string }) => ({
      outcome: "succeeded" as const, toolCallId: invocation.toolCallId, content: jsonToolResultContent({ ok: true }) }))
    const tools = new ToolRegistry()
    tools.register({ name: "echo", description: "Echo", inputSchema: { type: "object" },
      risk: "read_only", idempotent: true, concurrency: "parallel_safe", resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({ implementationId: "test.image.echo", implementationRevision: "1" }), invoke })
    await checkpoint(f, provider)
    const runner = new WanexAgentRunner({ session: f.session, provider, tools, toolPermissionPolicy: new AllowAllToolsPolicy() })
    const result = await runner.executeTurn({ execution: f.execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    expect(provider.calls).toBe(2)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect((await f.session.listMessages({ sessionId: f.execution.sessionId })).map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"])
    expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toHaveLength(1)
    expect(await f.session.listToolExecutions()).toMatchObject([{ state: "succeeded" }])
  })

  it("rejects digest changes, identity changes and generic publication bypasses atomically", async () => {
    const f = await fixture("immutable")
    const saved = await checkpoint(f)
    const request = { ...f.execution, invocationId: saved.invocationId, response: saved.response, responseDigest: digest(saved.response) }
    const repeated = await storage.checkpointProviderInvocation(request)
    expect(repeated?.state).toBe("output_ready")
    await expect(storage.checkpointProviderInvocation({ ...request, responseDigest: "0".repeat(64) })).rejects.toThrow(/digest/)
    const changed: ProviderResponseCheckpoint = { ...saved.response, parts: saved.response.parts.slice(1) }
    await expect(storage.checkpointProviderInvocation({ ...request, response: changed, responseDigest: digest(changed) })).rejects.toThrow(/conflict/)
    expect(await storage.checkpointProviderInvocation({ ...request, leaseToken: "stale" })).toBeNull()
    await expect(storage.finishProviderInvocation({ ...f.execution, invocationId: saved.invocationId, outcome: "succeeded", assistantMessage: changed.parts, providerState: changed.providerState })).rejects.toThrow(/checkpoint/)
    await expect(f.session.appendMessage({ ...f.execution, idempotencyKey: "bypass", role: "assistant", content: saved.response.parts })).rejects.toThrow(/checkpoint/)
    const result = await new WanexAgentRunner({ session: f.session, provider: imageProvider() }).executeTurn({ execution: f.execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    const repeatedSettlement = await f.session.settleTurn({ ...f.execution, outcome: "succeeded", providerInvocationId: saved.invocationId,
      assistantMessage: saved.response.parts, providerState: saved.response.providerState, result: { steps: 1, finishReason: "stop" } })
    if (!("settlement" in result)) throw new Error("expected a settled turn")
    expect(repeatedSettlement.assistantMessage?.id).toBe(result.settlement?.assistantMessage?.id)
    await expect(f.session.settleTurn({ ...f.execution, outcome: "succeeded", providerInvocationId: saved.invocationId,
      assistantMessage: changed.parts, providerState: changed.providerState, result: { steps: 1, finishReason: "stop" } })).rejects.toThrow()
    expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toHaveLength(1)
  })

  it("rejects forged resource evidence and foreign provider state before creating provenance", async () => {
    const f = await fixture("forged")
    vi.spyOn(f.session, "checkpointProviderInvocation").mockImplementation(async (request) => {
      const forged: ProviderResponseCheckpoint = { ...request.response, parts: request.response.parts.map((part) =>
        part.type === "resource" ? { ...part, sha256: "0".repeat(64) } : part) }
      await expect(storage.checkpointProviderInvocation({ ...request, response: forged, responseDigest: digest(forged) })).rejects.toThrow()
      const foreign: ProviderResponseCheckpoint = { ...request.response, providerState: [{
        providerId: "another-provider", modelId: "another-model", stateKind: "opaque", replayPolicy: "required", payload: {} }] }
      await expect(storage.checkpointProviderInvocation({ ...request, response: foreign, responseDigest: digest(foreign) })).rejects.toThrow(/scope/)
      expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toEqual([])
      expect((await storage.listProviderInvocations({ turnId: f.execution.turnId }))[0]?.state).toBe("output_observed")
      return await storage.checkpointProviderInvocation(request)
    })
    const saved = await checkpoint(f)
    const other = await fixture("other-turn")
    await expect(storage.checkpointProviderInvocation({ ...other.execution, invocationId: saved.invocationId,
      response: saved.response, responseDigest: digest(saved.response) })).rejects.toThrow(/identity/)
    expect(await storage.listResourceProvenance({ causeKind: "provider_output" })).toHaveLength(1)
  })

  it("does not charge provider usage twice when consuming the same ready checkpoint", async () => {
    const f = await fixture("usage")
    const grant = await storage.reserveBudget({ scope: { kind: "turn", ownerId: f.execution.turnId },
      limit: { tokens: 100 }, requested: { tokens: 100 }, principalId: f.execution.principalId,
      reason: "image-test", idempotencyKey: "image-budget" })
    const execution = { ...f.execution, budgetGrantId: grant.id }
    const provider = imageProvider()
    const context = new AgentRunnerExecutionContext({ session: f.session, provider })
    const saved = await context.runProviderCompletion(() => context.buildReplayMessages(execution.sessionId), undefined, execution, 1, async () => {})
    const result = await new WanexAgentRunner({ session: f.session, provider }).executeTurn({ execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    expect(provider.calls).toBe(1)
    expect(await storage.recordBudgetUsage({ grantId: grant.id, usage: { tokens: 8 }, source: "provider",
      sourceId: saved.invocationId, idempotencyKey: `provider:${saved.invocationId}` })).toMatchObject({ created: false })
    expect(await storage.commitBudget({ grantId: grant.id })).toMatchObject({ committed: { tokens: 8 } })
  })

  it.each(["cancel", "interrupt"] as const)("honors %s before publishing a ready response", async (kind) => {
    const f = await fixture(kind)
    await checkpoint(f)
    if (kind === "cancel") await f.session.requestTurnCancel({ ...f.execution, reason: "user" })
    else await f.session.interruptTurn({ ...f.execution, reason: "user" })
    const provider = imageProvider()
    const result = await new WanexAgentRunner({ session: f.session, provider }).executeTurn({ execution: f.execution, heartbeat: async () => {} })
    expect(result.outcome).toBe(kind === "cancel" ? "cancelled" : "interrupted")
    expect(provider.calls).toBe(0)
    expect((await f.session.listMessages({ sessionId: f.execution.sessionId })).filter((message) => message.role === "assistant")).toEqual([])
  })

  it("projects assistant images as descriptors when switching providers without rewriting history", async () => {
    const f = await fixture("switch")
    const saved = await checkpoint(f)
    const messages = [{ role: "assistant" as const, content: saved.response.parts, providerState: saved.response.providerState }]
    const read = vi.spyOn(f.session, "readResourceContent")
    const prepared = await prepareProviderReplayResources(f.session, { protocol: { id: "openai-chat-completions" }, inputModalities: ["text", "image"] }, messages)
    expect(prepared[0]?.content.every((part) => part.type === "text")).toBe(true)
    expect(JSON.stringify(prepared)).toContain("Assistant output")
    expect(read).not.toHaveBeenCalled()
    expect(saved.response.parts[1]?.type).toBe("resource")
  })

  it("publishes a ready image once before promoting steering and completing its follow-up", async () => {
    const f = await fixture("steering")
    await checkpoint(f)
    const steering = await f.session.steerTurn({ sessionId: f.execution.sessionId, principalId: f.execution.principalId,
      expectedTurnId: f.execution.turnId, expectedAttemptId: f.execution.attemptId,
      idempotencyKey: "image-steering", content: [{ type: "text", id: "steer", text: "describe the result" }] })
    expect(steering.status).toBe("accepted")
    const provider = imageProvider()
    provider.stream = async function* (request): AsyncIterable<ProviderEvent> {
      this.calls++
      expect(JSON.stringify(request.messages)).toContain("describe the result")
      yield { type: "text_delta", partId: "followup", delta: "description" }
      yield { type: "finish", reason: "stop" }
    }
    const result = await new WanexAgentRunner({ session: f.session, provider }).executeTurn({ execution: f.execution, heartbeat: async () => {} })
    expect(result.outcome).toBe("succeeded")
    expect(provider.calls).toBe(1)
    const messages = await f.session.listMessages({ sessionId: f.execution.sessionId })
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(messages.flatMap((message) => message.content).filter((part) => part.type === "resource")).toHaveLength(1)
  })

  it("freezes actual historical resource inputs and records provenance from the invocation", async () => {
    const f = await fixture("inputs")
    const resource = await storage.ingestResource({ content: png, origin: "user_upload", kind: "image", mediaType: "image/png" })
    const evidence = { resourceId: resource.id, sha256: resource.sha256, sizeBytes: resource.sizeBytes, kind: resource.kind, mediaType: resource.mediaType! }
    const context = new AgentRunnerExecutionContext({ session: f.session, provider: imageProvider() })
    const result = await context.runProviderCompletion(async () => [{ role: "user", content: [
      { type: "resource", id: "first", ...evidence, bytes: png }, { type: "resource", id: "repeated", ...evidence, bytes: png }
    ] }], undefined, f.execution, 1, async () => {})
    const [invocation] = await storage.listProviderInvocations({ turnId: f.execution.turnId })
    expect(invocation?.inputResources).toEqual([evidence])
    const [source] = await storage.listResourceProvenance({ causeKind: "provider_output", causeId: result.invocationId })
    expect(source?.inputResources).toEqual([evidence])
  })
})

function ownedServiceProcess(): childProcess.ChildProcess | undefined {
  const spawn = vi.mocked(childProcess.spawn)
  for (let index = spawn.mock.calls.length - 1; index >= 0; index--) {
    const args = spawn.mock.calls[index]!
    if (args[0] !== serviceBin || !Array.isArray(args[1]) || !args[1].includes(dir)) continue
    const result = spawn.mock.results[index]
    return result?.type === "return" ? result.value : undefined
  }
  return undefined
}
