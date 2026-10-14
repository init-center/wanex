import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  FakeProviderAdapter,
  GeminiAdapter,
  OpenAICompatibleAdapter
} from "@wanex/runtime/provider"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry
} from "@wanex/runtime/tools"

const tools = new ToolRegistry()
tools.register(new EchoTool())
const providerEvents = []
const fixtureRoot = required("WANEX_FIXTURE_ROOT")
const serviceBin = required("WANEX_SYSTEM_SERVICE_BIN")
const host = new WanexRuntimeHost({
  storageConfig: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(fixtureRoot, "store"),
    serviceBin
  },
  provider: new FakeProviderAdapter({
    responseText: "external tool continuation complete",
    toolName: "echo"
  }),
  tools,
  toolPermissionPolicy: new AllowAllToolsPolicy(),
  observeProviderEvent(event) {
    providerEvents.push(event.event.type)
  }
})

try {
  const submitted = await host.submitUserTurn({
    content: [{ type: "text", text: "use the echo tool" }],
    sessionId: "ses_external_provider_tool",
    maxSteps: 4
  })
  const run = await host.runOnce()
  assert.equal(run.results[0]?.worker.status, "completed")
  const [jobs, executions, messages, turns] = await Promise.all([
    host.listJobs({}),
    host.storage.listToolExecutions({}),
    host.storage.listSessionMessages({ sessionId: submitted.session.id }),
    host.storage.listSessionTurns({ sessionId: submitted.session.id })
  ])
  assert.equal(jobs.some((job) => job.state === "succeeded"), true)
  assert.equal(executions.length, 1)
  assert.equal(executions[0].state, "succeeded")
  assert.deepEqual(executions[0].input, { source: "fake-provider" })
  const admittedToolBinding =
    turns[0].executionBinding.toolSnapshot.tools[0].runtimeBinding
  assert.deepEqual(admittedToolBinding, {
    implementationId: "wanex.runtime.tool.echo",
    implementationRevision: "1"
  })
  assert.deepEqual(
    executions[0].descriptor.runtimeBinding,
    admittedToolBinding
  )
  assert.equal(providerEvents.includes("tool_call_start"), true)
  assert.equal(providerEvents.includes("text_delta"), true)
  assert.equal(providerEvents.filter((type) => type === "finish").length, 2)
  const assistantText = messages
    .filter(
      (message) =>
        message.turnId === submitted.turnId && message.role === "assistant"
    )
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  assert.equal(assistantText, "external tool continuation complete")
  const multimodal = await proveMultimodalInput({ fixtureRoot, serviceBin })
  const directImage = await proveDirectImage({ fixtureRoot, serviceBin })
  process.stdout.write(`${JSON.stringify({
    id: "provider-tool",
    ok: true,
    executionState: executions[0].state,
    toolImplementationRevision: admittedToolBinding.implementationRevision,
    providerEvents,
    assistantText,
    multimodal,
    directImage
  })}\n`)
} finally {
  await host.dispose()
  await host.dispose()
}

async function proveMultimodalInput({ fixtureRoot, serviceBin }) {
  const storeDir = join(fixtureRoot, "multimodal-store")
  const requestBodies = []
  const provider = new OpenAICompatibleAdapter({
    providerId: "external-openai",
    model: {
      id: "external-vision",
      operations: ["conversation"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: "external-consumer.vision",
        revision: "1"
      }
    },
    baseUrl: "https://provider.example.invalid/v1",
    apiKey: "external-secret",
    async fetch(_url, init) {
      requestBodies.push(JSON.parse(String(init?.body)))
      return openAIResponse("external image complete")
    }
  })
  const runtime = new WanexRuntimeHost({
    storageConfig: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    },
    provider
  })

  try {
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    const image = await runtime.storage.ingestResource({
      content: imageBytes,
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    const submitted = await runtime.submitUserTurn({
      sessionId: "ses_external_multimodal",
      content: [
        { type: "text", text: "inspect" },
        { type: "resource", resourceId: image.id }
      ]
    })
    const completed = await runtime.runOnce()
    assert.equal(completed.results[0]?.worker.status, "completed")
    assert.equal(requestBodies.length, 1)
    const projectedContent = requestBodies[0].messages[0].content
    assert.equal(projectedContent.length, 3)
    assert.deepEqual(projectedContent[0], { type: "text", text: "inspect" })
    assert.deepEqual(projectedContent[1], { type: "text", text: `[image ${image.id}]` })
    assert.deepEqual(projectedContent[2], {
      type: "image_url", image_url: { url: `data:image/png;base64,${imageBytes.toString("base64")}` }
    })
    const messages = await runtime.storage.listSessionMessages({
      sessionId: submitted.session.id
    })
    const serialized = JSON.stringify(messages)
    assert.equal(serialized.includes(imageBytes.toString("base64")), false)
    assert.equal(serialized.includes("bytes"), false)
    assert.equal(serialized.includes(image.sha256), true)

    const pdf = await runtime.storage.ingestResource({
      content: Uint8Array.from([37, 80, 68, 70]),
      mediaType: "application/pdf",
      kind: "document",
      origin: "user_upload"
    })
    await assert.rejects(
      runtime.submitUserTurn({
        sessionId: "ses_external_unsupported",
        content: [{ type: "resource", resourceId: pdf.id }]
      }),
      /does not support document input/
    )
    assert.equal(requestBodies.length, 1)

    const changed = await runtime.storage.ingestResource({
      content: imageBytes,
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    await runtime.submitUserTurn({
      sessionId: "ses_external_changed_resource",
      content: [{ type: "resource", resourceId: changed.id }]
    })
    const tampered = Buffer.from(imageBytes)
    tampered[tampered.length - 1] ^= 1
    await writeFile(
      join(storeDir, "files", changed.logicalPath),
      tampered
    )
    const failed = await runtime.runOnce()
    assert.equal(failed.results[0]?.worker.status, "failed")
    assert.match(failed.results[0].worker.error.message, /image content hash changed/)
    assert.equal(requestBodies.length, 1)

    return {
      providerRequests: requestBodies.length,
      canonicalResourceEvidence: true,
      unsupportedRejectedBeforeDispatch: true,
      changedBytesRejectedBeforeDispatch: true
    }
  } finally {
    await runtime.dispose()
  }
}

function openAIResponse(text) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: "stop" }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

async function proveDirectImage({ fixtureRoot, serviceBin }) {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  const requests = []
  const observed = []
  const provider = new GeminiAdapter({ providerId: "external-gemini", baseUrl: "https://fixture.invalid", apiKey: "fixture-key",
    model: { id: "external-image-model", operations: ["conversation"], inputModalities: ["text", "image"],
      outputModalities: ["text", "image"], features: [], catalog: { source: "custom", catalogId: "external-image", revision: "1" } },
    async fetch(_url, init) {
      requests.push(JSON.parse(init.body))
      return { ok: true, status: 200, statusText: "OK", text: async () => "", body: (async function* () {
        yield `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [
          { text: "before" }, { inlineData: { mimeType: "image/png", data: bytes.toString("base64") }, thoughtSignature: "opaque-signature" }, { text: "after" }
        ] }, finishReason: "STOP" }] })}\n\n`
      })() }
    }
  })
  const options = { storageConfig: { kind: "local-system-service", mode: "persistent", storeDir: join(fixtureRoot, "direct-image-store"), serviceBin }, provider,
    observeProviderEvent: (event) => observed.push(event) }
  let runtime = new WanexRuntimeHost(options)
  try {
    const turn = await runtime.submitUserTurn({ sessionId: "external-direct-image", content: [{ type: "text", text: "generate" }] })
    assert.equal((await runtime.runOnce()).results[0]?.worker.status, "completed")
    const [invocation] = await runtime.storage.listProviderInvocations({ turnId: turn.turnId })
    assert.equal(invocation.state, "succeeded")
    const parts = invocation.responseCheckpoint.parts
    assert.deepEqual(parts.map(part => part.type), ["text", "resource", "text"])
    const evidence = parts[1]
    const chunk = await runtime.storage.readResourceContent({ resourceId: evidence.resourceId, expectedSha256: evidence.sha256, offset: 0, limit: bytes.length })
    assert.deepEqual(Buffer.from(chunk.content), bytes)
    assert.equal((await runtime.storage.listResourceProvenance({ causeKind: "provider_output", causeId: invocation.id })).length, 1)
    assert.equal(JSON.stringify(observed).includes("opaque-signature"), false)
    await runtime.dispose()
    runtime = new WanexRuntimeHost(options)
    await runtime.submitUserTurn({ sessionId: turn.session.id, content: [{ type: "text", text: "adjust" }] })
    assert.equal((await runtime.runOnce()).results[0]?.worker.status, "completed")
    assert.equal(requests.length, 2)
    const replay = requests[1].contents.find(message => message.role === "model")
    assert.equal(replay.parts[1].inlineData.data, bytes.toString("base64"))
    assert.equal(replay.parts[1].thoughtSignature, "opaque-signature")
    return { persisted: true, exactReplay: true, privateStateRedacted: true, providerRequests: requests.length }
  } finally { await runtime.dispose() }
}
