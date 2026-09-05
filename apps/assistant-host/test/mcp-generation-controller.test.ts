import { afterEach, describe, expect, it } from "vitest"
import type {
  JsonValue,
  SessionTurnExecutionBinding,
} from "@wanex/protocol"
import { WanexMcpHttpServerHost } from "@wanex/mcp/server"
import type {
  ResolveSessionTurnAgentContextRequest,
  ResolvedSessionTurnAgentContext,
} from "@wanex/runtime/execution"
import { EchoTool, ToolRegistry } from "@wanex/runtime/tools"
import type { ConfigEntryRecord } from "@wanex/storage"
import {
  createLocalMcpGenerationController,
  encodeLocalMcpServerDefinition,
  localMcpServerKey,
  type LocalMcpServerDefinition,
} from "../src/mcp/index.js"

const controllers: Array<Awaited<ReturnType<typeof createLocalMcpGenerationController>>> = []
const hosts: WanexMcpHttpServerHost[] = []

afterEach(async () => {
  while (controllers.length > 0) await controllers.pop()?.dispose()
  while (hosts.length > 0) await hosts.pop()?.dispose()
})

describe("Assistant Host MCP generation controller", () => {
  it("keeps two pending admissions exact across reload and releases each owner once", async () => {
    const server = await startMcpServer()
    const config = mutableConfigStorage(
      configEntry(serverDefinition("generation", server.url()))
    )
    const controller = await createController(config)

    const first = requireResolved(controller.resolve(request("first", "admission")))
    const second = requireResolved(controller.resolve(request("second", "admission")))
    const firstBinding = binding(first, "binding_first")
    const secondBinding = binding(second, "binding_second")
    const firstIdentity = requireIdentity(first)
    const secondIdentity = requireIdentity(second)
    expect(firstIdentity).toBe(secondIdentity)

    config.replace(configEntry(
      serverDefinition("generation", server.url(), "reloaded label")
    ))
    expect((await controller.reload()).outcome).toBe("published")

    const next = requireResolved(controller.resolve(request("next", "admission")))
    const nextIdentity = requireIdentity(next)
    expect(nextIdentity).not.toBe(firstIdentity)

    first.lease?.commit(firstBinding)
    second.lease?.commit(secondBinding)
    expect(requireResolved(controller.resolve({
      ...request("first", "execution"),
      executionBinding: firstBinding,
      contextIdentity: firstIdentity,
    })).contextIdentity).toBe(firstIdentity)
    expect(requireResolved(controller.resolve({
      ...request("second", "execution"),
      executionBinding: secondBinding,
      contextIdentity: secondIdentity,
    })).contextIdentity).toBe(secondIdentity)

    observeTerminal(controller, "first")
    observeTerminal(controller, "first")
    expect(requireResolved(controller.resolve({
      ...request("second", "execution"),
      executionBinding: secondBinding,
      contextIdentity: secondIdentity,
    })).contextIdentity).toBe(firstIdentity)

    observeTerminal(controller, "second")
    expect(() => controller.resolve({
      ...request("first", "execution"),
      executionBinding: firstBinding,
      contextIdentity: firstIdentity,
    })).toThrow("no longer available")

    next.lease?.rollback()
  })

  it("rejects an unusable candidate without changing the active generation", async () => {
    const server = await startMcpServer()
    const config = mutableConfigStorage(
      configEntry(serverDefinition("rejected", server.url()))
    )
    const controller = await createController(config)
    const active = requireResolved(controller.resolve(request("active", "admission")))
    const identity = requireIdentity(active)
    const activeBinding = binding(active, "binding_active")
    active.lease?.commit(activeBinding)

    config.replace(configEntry(localMcpServerKey("rejected"), { invalid: true }))
    expect((await controller.reload()).outcome).toBe("rejected")
    expect(requireResolved(controller.resolve({
      ...request("active", "execution"),
      executionBinding: activeBinding,
      contextIdentity: identity,
    })).contextIdentity).toBe(identity)

    observeTerminal(controller, "active")
  })

  it("does not create an owner when terminal arrives before durable commit", async () => {
    const server = await startMcpServer()
    const config = mutableConfigStorage(
      configEntry(serverDefinition("early-terminal", server.url()))
    )
    const controller = await createController(config)
    const pending = requireResolved(
      controller.resolve(request("early", "admission"))
    )
    const identity = requireIdentity(pending)
    const pendingBinding = binding(pending, "binding_early")

    observeTerminal(controller, "early")
    pending.lease?.commit(pendingBinding)
    config.replace(configEntry(
      serverDefinition("early-terminal", server.url(), "new generation")
    ))
    expect((await controller.reload()).outcome).toBe("published")
    expect(() => controller.resolve({
      ...request("early", "execution"),
      executionBinding: pendingBinding,
      contextIdentity: identity,
    })).toThrow("no longer available")
  })

  it("retains the exact generation for an inherited child until its own terminal signal", async () => {
    const server = await startMcpServer()
    const config = mutableConfigStorage(
      configEntry(serverDefinition("inherited", server.url()))
    )
    const controller = await createController(config)
    const parent = requireResolved(controller.resolve(request("parent", "admission")))
    const parentIdentity = requireIdentity(parent)
    const parentBinding = binding(parent, "binding_parent")
    parent.lease?.commit(parentBinding)

    const child = requireResolved(controller.resolve({
      ...request("child", "inheritance"),
      executionBinding: parentBinding,
      contextIdentity: parentIdentity,
    }))
    expect(child.lease?.phase).toBe("inheritance")
    const childBinding = binding(child, "binding_child")
    child.lease?.commit(childBinding)

    config.replace(configEntry(
      serverDefinition("inherited", server.url(), "new generation")
    ))
    expect((await controller.reload()).outcome).toBe("published")
    observeTerminal(controller, "parent")
    expect(requireResolved(controller.resolve({
      ...request("child", "execution"),
      executionBinding: childBinding,
      contextIdentity: parentIdentity,
    })).contextIdentity).toBe(parentIdentity)

    observeTerminal(controller, "child")
    expect(() => controller.resolve({
      ...request("child", "execution"),
      executionBinding: childBinding,
      contextIdentity: parentIdentity,
    })).toThrow("no longer available")
  })
})

async function createController(config: ReturnType<typeof mutableConfigStorage>) {
  const controller = await createLocalMcpGenerationController({
    storage: config,
    secretResolver: {
      async resolve() {
        throw new Error("generation fixture does not use credentials")
      },
    },
  })
  controllers.push(controller)
  return controller
}

async function startMcpServer(): Promise<WanexMcpHttpServerHost> {
  const registry = new ToolRegistry()
  registry.register(new EchoTool())
  const host = new WanexMcpHttpServerHost({
    registry,
    async resolveExecutionContext() {
      throw new Error("generation discovery must not execute a Tool")
    },
  })
  hosts.push(host)
  await host.start()
  return host
}

type AdmissionRequest = Extract<
  ResolveSessionTurnAgentContextRequest,
  { readonly phase: "admission" }
>
type BoundRequest = Extract<
  ResolveSessionTurnAgentContextRequest,
  { readonly phase: "execution" | "inheritance" }
>

function request(suffix: string, phase: "admission"): AdmissionRequest
function request(suffix: string, phase: "execution" | "inheritance"): BoundRequest
function request(
  suffix: string,
  phase: ResolveSessionTurnAgentContextRequest["phase"]
): ResolveSessionTurnAgentContextRequest {
  const base = {
    sessionId: "session_generation",
    inputId: `input_${suffix}`,
    turnId: `turn_${suffix}`,
    signal: new AbortController().signal,
  }
  return phase === "admission"
    ? { ...base, phase }
    : {
        ...base,
        phase,
        executionBinding: { digest: `unused_${suffix}` } as SessionTurnExecutionBinding,
      }
}

function requireResolved(
  value: ResolvedSessionTurnAgentContext | undefined
): ResolvedSessionTurnAgentContext {
  if (value === undefined) throw new Error("generation fixture did not resolve context")
  return value
}

function requireIdentity(
  value: ResolvedSessionTurnAgentContext
): NonNullable<ResolvedSessionTurnAgentContext["contextIdentity"]> {
  if (value.contextIdentity === undefined) {
    throw new Error("generation fixture did not return context identity")
  }
  return value.contextIdentity
}

function binding(
  value: ResolvedSessionTurnAgentContext,
  digest: string
): SessionTurnExecutionBinding {
  return {
    digest,
    toolSnapshot: value.context?.tools?.snapshot() as unknown as JsonValue,
  } as SessionTurnExecutionBinding
}

function observeTerminal(
  controller: Awaited<ReturnType<typeof createLocalMcpGenerationController>>,
  suffix: string
): void {
  controller.observeTurnLifecycle({
    kind: "wanex-runtime.session-turn-lifecycle",
    phase: "terminal",
    reference: {
      sessionId: "session_generation",
      inputId: `input_${suffix}`,
      turnId: `turn_${suffix}`,
      jobId: `job_${suffix}`,
    },
  })
}

function serverDefinition(
  serverId: string,
  url: string,
  label = "generation server"
): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId,
    label,
    enabled: true,
    capabilityRevision: "generation-v1",
    connectTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    transport: { kind: "streamable_http", url, headers: [] },
  }
}

function configEntry(keyOrDefinition: string | LocalMcpServerDefinition, value?: JsonValue): ConfigEntryRecord {
  if (typeof keyOrDefinition !== "string") {
    return configEntry(
      localMcpServerKey(keyOrDefinition.serverId),
      encodeLocalMcpServerDefinition(keyOrDefinition)
    )
  }
  return { key: keyOrDefinition, value: value ?? {}, revision: 1, updatedAt: 1 }
}

function mutableConfigStorage(initial: ConfigEntryRecord) {
  let entries = [initial]
  return {
    replace(next: ConfigEntryRecord) {
      entries = [next]
    },
    async listConfigEntries(request: {
      readonly prefix: string
      readonly afterKey?: string
      readonly limit?: number
    }) {
      return entries
        .filter((entry) =>
          entry.key.startsWith(request.prefix) &&
          (request.afterKey === undefined || entry.key > request.afterKey)
        )
        .slice(0, request.limit)
    },
  }
}
