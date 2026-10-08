import { createServer } from "node:http"
import { request as httpsRequest } from "node:https"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { promisify } from "node:util"
import { expect, it } from "vitest"
import { createRemoteAssistantAgentHostComposition } from "@wanex/assistant-host"
import { createPackagedServer } from "../scripts/packaged-server.mjs"

const execFileAsync = promisify(execFile)

it("continues disconnected work on a packaged Server and applies independent remote roots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wanex-packaged-workspace-"))
  const roots = [join(directory, "remote-a"), join(directory, "remote-b")]
  const localRoot = join(directory, "client-local")
  const localFile = join(localRoot, "note.txt")
  const provider = await startProvider()
  let packaged
  let client
  let stream
  try {
    await mkdir(localRoot)
    await writeFile(localFile, "client-only")
    for (const root of roots) {
      await execFileAsync("git", ["init", "--quiet", root])
      await writeFile(join(root, "note.txt"), "before")
      for (const args of [["config", "user.name", "Wanex Test"], ["config", "user.email", "test@wanex.local"], ["config", "core.autocrlf", "false"], ["add", "."], ["commit", "-m", "initial"]]) {
        await execFileAsync("git", ["-C", root, ...args])
      }
    }
    packaged = await createPackagedServer({
      provider: { baseUrl: provider.baseUrl, credential: "packaged-proof-provider" },
      workspace: {
        initialRoots: roots.map((path, index) => ({
          id: `remote-${index}`, path, effects: ["read", "write", "create", "remove"]
        }))
      }
    })
    client = await createRemoteAssistantAgentHostComposition({
      messageUrl: packaged.endpoint,
      getBearerToken: () => packaged.credential,
      fetch: await createHttpsFetch(packaged.caPath),
      clientId: "packaged-workspace-client"
    })
    stream = client.startEvents()
    await stream.ready
    const sessionId = "packaged-workspace-session"
    const request = {
      sessionId,
      idempotencyKey: "packaged-workspace-proposal",
      text: JSON.stringify({
        rootId: "remote-0",
        changes: [{ path: "note.txt", kind: "update", baseText: "before", targetText: "after-a" }]
      })
    }
    const submitted = await client.client.submitConversationOperation(request)
    expect(submitted).toMatchObject({ ok: true })

    await provider.started
    stream.close()
    await stream.closed
    await client.close()
    client = undefined
    provider.release()
    await provider.completed

    client = await createRemoteAssistantAgentHostComposition({
      messageUrl: packaged.endpoint,
      getBearerToken: () => packaged.credential,
      fetch: await createHttpsFetch(packaged.caPath),
      clientId: "packaged-workspace-reconnected"
    })
    stream = client.startEvents()
    await stream.ready
    const firstProposal = await readProposal(client, sessionId, "after-a")
    await expect(client.client.submitConversationOperation(request)).resolves.toMatchObject({
      ok: true,
      value: { operation: { operationId: submitted.value.operation.operationId, sessionId } }
    })
    await expect.poll(async () => {
      const result = await client.client.readTrackedConversationOperation({ sessionId })
      return result.ok && result.value.kind === "assistant.conversation-operation.found"
        ? result.value.operation.state : undefined
    }, { timeout: 10_000 }).toBe("succeeded")

    await expect(client.client.submitConversationOperation({
      sessionId,
      idempotencyKey: "packaged-workspace-proposal-b",
      text: JSON.stringify({
        rootId: "remote-1",
        changes: [{ path: "note.txt", kind: "update", baseText: "before", targetText: "after-b" }]
      })
    })).resolves.toMatchObject({ ok: true })
    const secondProposal = await readProposal(client, sessionId, "after-b")
    expect(firstProposal.changeRef).not.toBe(secondProposal.changeRef)

    const transcript = await client.client.readSessionTranscript({ sessionId })
    expect(transcript).toMatchObject({ ok: true, value: { kind: "assistant.session-transcript.found" } })
    expect(transcript.value.transcript.rows.filter((row) => row.role === "user")).toHaveLength(2)
    expect(transcript.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? [])
      .filter((change) => change.changeKind === "proposal")).toHaveLength(2)
    expect(provider.preparations).toEqual(["remote-0", "remote-1"])
    for (const root of roots) {
      expect(JSON.stringify(transcript)).not.toContain(root)
      expect(await readFile(join(root, "note.txt"), "utf8")).toBe("before")
    }

    for (const [index, proposal] of [firstProposal, secondProposal].entries()) {
      expect(proposal.files).toMatchObject([{ path: "note.txt", after: { text: index === 0 ? "after-a" : "after-b" } }])
      await expect(client.client.decideWorkspaceChange({ sessionId, changeRef: proposal.changeRef, decision: "approve", idempotencyKey: `packaged-workspace-approve-${index}` })).resolves.toMatchObject({ ok: true, value: { status: "approved" } })
      await expect(client.client.applyWorkspaceChange({ sessionId, changeRef: proposal.changeRef, idempotencyKey: `packaged-workspace-apply-${index}` })).resolves.toMatchObject({ ok: true, value: { outcome: "applied" } })
      expect(await readFile(join(roots[index], "note.txt"), "utf8")).toBe(index === 0 ? "after-a" : "after-b")
      expect(await readFile(localFile, "utf8")).toBe("client-only")
      if (index === 0) expect(await readFile(join(roots[1], "note.txt"), "utf8")).toBe("before")
    }
    expect(await readFile(join(roots[0], "note.txt"), "utf8")).toBe("after-a")
    expect(await readFile(join(roots[1], "note.txt"), "utf8")).toBe("after-b")
  } finally {
    provider.release()
    stream?.close()
    await stream?.closed
    await client?.close()
    await packaged?.close()
    await provider.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 120_000)

async function readProposal(client, sessionId, targetText) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const transcript = await client.client.readSessionTranscript({ sessionId })
    if (transcript.ok && transcript.value.kind === "assistant.session-transcript.found") {
      const changes = transcript.value.transcript.rows.flatMap((row) => row.workspaceChanges ?? []).filter((item) => item.changeKind === "proposal")
      for (const change of changes) {
        const result = await client.client.readWorkspaceChange({ sessionId, changeRef: change.changeRef })
        if (result.ok && result.value.files.some((file) => file.after?.text === targetText)) return result.value
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("packaged Server did not produce a workspace proposal")
}

async function startProvider() {
  const started = Promise.withResolvers()
  const released = Promise.withResolvers()
  const completed = Promise.withResolvers()
  const preparations = []
  let first = true
  const server = createServer(async (request, response) => {
    const body = JSON.parse(await readRequest(request))
    const lastUser = body.messages.map((message) => message.role).lastIndexOf("user")
    const input = JSON.parse(body.messages[lastUser].content)
    const hasResult = body.messages.slice(lastUser + 1).some((message) => message.role === "tool")
    if (!hasResult) preparations.push(input.rootId)
    if (first) {
      first = false
      started.resolve()
      await released.promise
    }
    const delta = hasResult
      ? { content: "packaged workspace proposal ready" }
      : { tool_calls: [{ index: 0, id: "packaged-workspace-call", type: "function", function: { name: "workspace_prepare_isolated_changes", arguments: JSON.stringify(input) } }] }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: hasResult ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`)
    if (hasResult) completed.resolve()
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("provider did not listen")
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    started: started.promise,
    completed: completed.promise,
    get preparations() { return [...preparations] },
    release: () => released.resolve(),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  }
}

function readRequest(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

async function createHttpsFetch(certificatePath) {
  const ca = await readFile(certificatePath)
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    return await new Promise((resolve, reject) => {
      const request = httpsRequest(url, { method: init.method ?? "GET", headers, ca, servername: "localhost", signal: init.signal ?? undefined }, (response) => {
        const responseHeaders = new Headers()
        for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value)
        resolve(new Response(Readable.toWeb(response), { status: response.statusCode ?? 500, headers: responseHeaders }))
      })
      request.on("error", reject)
      if (init.body !== undefined && init.body !== null) request.write(init.body)
      request.end()
    })
  }
}
