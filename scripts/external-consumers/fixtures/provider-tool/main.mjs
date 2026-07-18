import assert from "node:assert/strict"
import { join } from "node:path"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { FakeProviderAdapter } from "@wanex/runtime/provider"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry
} from "@wanex/runtime/tools"

const tools = new ToolRegistry()
tools.register(new EchoTool())
const providerEvents = []
const host = new WanexRuntimeHost({
  storageConfig: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(required("WANEX_FIXTURE_ROOT"), "store"),
    serviceBin: required("WANEX_SYSTEM_SERVICE_BIN")
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
  const submitted = await host.submitUserText({
    text: "use the echo tool",
    sessionId: "ses_external_provider_tool",
    mode: "to_completion",
    maxSteps: 4
  })
  const run = await host.runOnce()
  assert.equal(run.results[0]?.worker.status, "completed")
  const [jobs, executions, messages] = await Promise.all([
    host.listJobs({}),
    host.storage.listToolExecutions({}),
    host.storage.listSessionMessages({ sessionId: submitted.session.id })
  ])
  assert.equal(jobs.some((job) => job.state === "succeeded"), true)
  assert.equal(executions.length, 1)
  assert.equal(executions[0].state, "succeeded")
  assert.deepEqual(executions[0].input, { source: "fake-provider" })
  assert.equal(providerEvents.includes("tool_call_start"), true)
  assert.equal(providerEvents.includes("text_delta"), true)
  assert.equal(providerEvents.filter((type) => type === "finish").length, 2)
  const assistantText = messages
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  assert.equal(assistantText, "external tool continuation complete")
  process.stdout.write(`${JSON.stringify({
    id: "provider-tool",
    ok: true,
    executionState: executions[0].state,
    providerEvents,
    assistantText
  })}\n`)
} finally {
  await host.dispose()
  await host.dispose()
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
