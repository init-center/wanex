import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { createRemoteAssistantAgentHostComposition } from "@wanex/assistant-host"
import { bootstrapWanexStorage, type BootstrappedWanexStorage } from "@wanex/runtime/bootstrap"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { startWanexServerInternal } from "../src/start.js"
import { createHttpsFetch, createTestCertificate } from "./support/tls.js"
import { startToolProvider } from "./support/tool-provider.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!()
})

it("recovers pending Workspace approval across restart and continues the original remote Session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wanex-remote-workspace-access-"))
  closers.push(() => rm(directory, { recursive: true, force: true }))
  const root = await mkdtemp(join(directory, "dynamic-root-"))
  await writeFile(join(root, "note.txt"), "remote dynamic workspace\n", "utf8")

  const certificate = await createTestCertificate()
  closers.push(() => certificate.close())
  const provider = await startToolProvider({ accessPath: root })
  closers.push(() => provider.close())
  let runtime: BootstrappedWanexStorage | undefined
  const serverOptions = {
    config: {
      hostId: "server:dynamic-access",
      dataRoot: join(directory, "data"),
      profileId: "dynamic-access",
      listener: { hostname: "127.0.0.1", port: 0 },
      workspace: { initialRoots: [] }
    },
    serviceBin,
    tls: certificate,
    authentication: {
      ownerSubjectId: "remote-user",
      async authenticateBearerToken(token: string) {
        return token === "test-bearer"
          ? { subjectId: "remote-user", expiresAt: Date.now() + 60_000 }
          : null
      }
    },
    secretResolver: new SecretResolver([
      new EnvSecretProvider({ WORKSPACE_TEST_KEY: "fixture" })
    ]),
    modelEndpoints: {
      endpoints: [provider.endpoint],
      activeEndpointId: provider.endpoint.id
    }
  } as const
  let server = await startWanexServerInternal(serverOptions, {
    async bootstrapStorage(options) {
      runtime = await bootstrapWanexStorage(options)
      return runtime
    }
  })
  const firstServer = server
  closers.push(() => firstServer.close())

  let client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl,
    getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert),
    clientId: "remote-dynamic-access"
  })
  const firstClient = client
  closers.push(() => firstClient.close())
  let stream = client.startEvents()
  await stream.ready

  const sessionId = "remote-dynamic-access-session"
  await expect(client.client.submitConversationOperation({
    sessionId,
    idempotencyKey: "dynamic-access-once",
    text: JSON.stringify({
      tool: "access",
      effects: ["read"],
      scope: "session",
      reason: "inspect the requested workspace"
    })
  })).resolves.toMatchObject({ ok: true })

  const readOperation = async () => {
    const result = await client.client.readTrackedConversationOperation({ sessionId })
    return result.ok && result.value.kind === "assistant.conversation-operation.found"
      ? result.value.operation
      : undefined
  }
  await expect.poll(async () => (await readOperation())?.approvals?.items.length ?? 0, {
    timeout: 10_000
  }).toBe(1)
  const pending = await readOperation()
  const approval = pending?.approvals?.items[0]
  expect(approval).toBeDefined()
  expect(JSON.stringify(approval)).not.toContain(root)
  expect(JSON.stringify(approval)).toContain("read")
  expect(JSON.stringify(approval)).toContain("session")

  const pendingTurns = await runtime!.storage.listSessionTurns({ sessionId })
  expect(pendingTurns).toHaveLength(1)
  const pendingExecutions = await runtime!.storage.listToolExecutions({
    turnId: pendingTurns[0]!.id
  })
  expect(pendingExecutions.map((execution) => execution.toolName)).toEqual([
    "workspace_request_access"
  ])

  stream.close()
  await stream.closed
  await client.close()
  await server.close()
  server = await startWanexServerInternal(serverOptions, {
    async bootstrapStorage(options) {
      runtime = await bootstrapWanexStorage(options)
      return runtime
    }
  })
  const pendingRestartServer = server
  closers.push(() => pendingRestartServer.close())
  client = await createRemoteAssistantAgentHostComposition({
    messageUrl: server.endpoint.messageUrl,
    getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert),
    clientId: "remote-dynamic-access-pending-restarted"
  })
  const pendingRestartClient = client
  closers.push(() => pendingRestartClient.close())
  stream = client.startEvents()
  await stream.ready

  const recovered = await readOperation()
  expect(recovered?.approvals?.items).toEqual(pending!.approvals!.items)
  expect((await runtime!.storage.listSessionTurns({ sessionId })).map((turn) => turn.id))
    .toEqual(pendingTurns.map((turn) => turn.id))
  expect((await runtime!.storage.listToolExecutions({ turnId: pendingTurns[0]!.id }))
    .map((execution) => execution.id)).toEqual(pendingExecutions.map((execution) => execution.id))
  expect(await readFile(join(root, "note.txt"), "utf8")).toBe("remote dynamic workspace\n")

  await expect(client.client.resolveTrackedConversationApproval({
    sessionId,
    approvalId: approval!.approvalId,
    expectedApprovalRevision: approval!.approvalRevision,
    decision: "approve_once",
    reason: "approve the requested workspace read",
    idempotencyKey: "dynamic-access-approval-once"
  })).resolves.toMatchObject({ ok: true })

  await expect.poll(async () => (await readOperation())?.state, {
    timeout: 10_000
  }).toBe("succeeded")

  const transcript = await client.client.readSessionTranscript({ sessionId })
  expect(transcript).toMatchObject({ ok: true })
  expect(JSON.stringify(transcript)).toContain("remote dynamic workspace")
  expect(JSON.stringify(transcript)).not.toContain(root)
  expect(await readFile(join(root, "note.txt"), "utf8")).toBe(
    "remote dynamic workspace\n"
  )
  const turns = await runtime!.storage.listSessionTurns({ sessionId })
  expect(turns).toHaveLength(1)
  const messages = await runtime!.storage.listSessionMessages({ sessionId })
  expect(messages.filter((message) => message.role === "user")).toHaveLength(1)
  const executions = await runtime!.storage.listToolExecutions({ turnId: turns[0]!.id })
  expect(executions.map((execution) => execution.toolName)).toEqual([
    "workspace_request_access",
    "workspace_read_text"
  ])
  expect(executions.every((execution) => execution.state === "succeeded")).toBe(true)

  stream.close()
  await stream.closed
  await client.close()
  await server.close()

  const restartedServer = await startWanexServerInternal(serverOptions)
  closers.push(() => restartedServer.close())
  const restartedClient = await createRemoteAssistantAgentHostComposition({
    messageUrl: restartedServer.endpoint.messageUrl,
    getBearerToken: () => "test-bearer",
    fetch: createHttpsFetch(certificate.cert),
    clientId: "remote-dynamic-access-restarted"
  })
  closers.push(() => restartedClient.close())
  const restartedStream = restartedClient.startEvents()
  await restartedStream.ready
  const restartedTranscript = await restartedClient.client.readSessionTranscript({ sessionId })
  expect(restartedTranscript).toMatchObject({ ok: true })
  expect(JSON.stringify(restartedTranscript)).toContain("remote dynamic workspace")
  expect(JSON.stringify(restartedTranscript)).not.toContain(root)
  expect(await restartedClient.client.readTrackedConversationOperation({ sessionId })).toMatchObject({
    ok: true,
    value: { kind: "assistant.conversation-operation.found", operation: { state: "succeeded" } }
  })
  restartedStream.close()
  await restartedStream.closed
})
