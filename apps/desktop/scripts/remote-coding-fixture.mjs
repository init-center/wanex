import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "node:https"
import { promisify } from "node:util"
import { CodingApplicationError } from "../../coding/src/index.ts"
import {
  createRemoteCodingAgentHostHandler,
} from "../../coding/src/host/agent-host/index.ts"
import {
  createRemoteAgentHostNodeHttpAdapter,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
} from "../../../packages/runtime/src/host/index.ts"
import {
  WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL,
  WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID,
} from "../src/proof-contract.ts"

const execFileAsync = promisify(execFile)

/**
 * Proof-only localhost TLS server. It uses the same Remote Coding Host
 * handler and Node adapter as the domain conformance suite; the packaged
 * application never imports this module.
 */
export async function createRemoteCodingFixture() {
  const certificate = await createTestCertificate()
  const requests = []
  const activeEventResponses = new Set()
  const observations = {
    listProjects: 0,
    readProject: 0,
    listSessions: 0,
  }
  const project = codingProject()
  const application = createApplication(project, observations)
  const handler = createRemoteCodingAgentHostHandler({
    authenticateBearerToken: async (token) => token === WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL
      ? {
          subjectId: "packaged-remote-subject",
          expiresAt: Date.now() + 60_000,
        }
      : null,
    resolveCodingHost: async (subject) => subject.subjectId === "packaged-remote-subject"
      ? {
          application,
          host: {
            hostId: "packaged-remote-coding-host",
            instanceId: "packaged-remote-coding-instance",
            connectionKind: "remote_tls",
            executionLocation: "remote",
          },
          grant: {
            subjectId: subject.subjectId,
            hostId: "packaged-remote-coding-host",
            domains: ["coding"],
            expiresAt: Date.now() + 60_000,
          },
        }
      : null,
    createSessionId: () => `packaged_remote_session_${requests.length + 1}`,
    createEndpointAccessToken: () => `packaged_remote_endpoint_${requests.length + 1}`,
    limits: {
      maxEventSubscribers: 2,
      requestTimeoutMs: 2_000,
    },
  })
  const adapter = createRemoteAgentHostNodeHttpAdapter({
    handler,
    keepaliveIntervalMs: 30_000,
  })
  const server = createServer(
    {
      key: await readFile(certificate.keyPath),
      cert: await readFile(certificate.certPath),
    },
    (request, response) => {
      const path = new URL(request.url ?? "/", "https://localhost").pathname
      if (path === REMOTE_AGENT_HOST_SSE_EVENT_PATH) {
        activeEventResponses.add(response)
        response.once("close", () => activeEventResponses.delete(response))
      }
      void recordRequest(request, path, requests)
        .then(() => adapter.handle(request, response))
        .catch(() => response.destroy())
    },
  )

  try {
    await listen(server)
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("packaged Remote Coding fixture did not bind")
    }
    let closed = false
    return {
      endpoint: `https://localhost:${address.port}${REMOTE_AGENT_HOST_MESSAGE_PATH}`,
      caPath: certificate.certPath,
      projectId: WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID,
      requests,
      observations,
      get activeEventResponseCount() {
        return activeEventResponses.size
      },
      get status() {
        return handler.getStatus()
      },
      async close() {
        if (closed) return
        closed = true
        await handler.close()
        for (const response of [...activeEventResponses]) response.destroy()
        await closeServer(server).catch((error) => {
          if (error?.code !== "ERR_SERVER_NOT_RUNNING") throw error
        })
        await rm(certificate.directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await handler.close().catch(() => {})
    await closeServer(server).catch(() => {})
    await rm(certificate.directory, { recursive: true, force: true })
    throw error
  }

}

function createApplication(project, observations) {
  const emptyPage = (key) => ({ [key]: [], returnedCount: 0, hasMore: false })
  const application = {
    state: "open",
    listProjects: async () => {
      observations.listProjects += 1
      return [project]
    },
    readProject: async (request) => {
      observations.readProject += 1
      return request.projectId === project.projectId ? project : null
    },
    closeProject: async () => undefined,
    listSessions: async (request) => {
      observations.listSessions += 1
      if (request.projectId !== project.projectId) return emptyPage("sessions")
      return { sessions: [], returnedCount: 0, hasMore: false }
    },
    readSession: async () => null,
    readTranscript: async () => null,
    listTurns: async () => ({ turns: [], returnedCount: 0, hasMore: false }),
    startTurn: async () => {
      throw new CodingApplicationError("invalid_request", "fixture Turn is unavailable")
    },
    readTurn: async () => null,
    readLiveTurn: async () => null,
    cancelTurn: async () => {
      throw new CodingApplicationError("turn_unavailable", "fixture Turn is unavailable")
    },
    resolveTurnRecovery: async () => {
      throw new CodingApplicationError("turn_unavailable", "fixture Turn is unavailable")
    },
    resolveTurnApproval: async () => {
      throw new CodingApplicationError("turn_unavailable", "fixture Turn is unavailable")
    },
    readProposal: async () => null,
    decideProposal: async () => {
      throw new CodingApplicationError("invalid_request", "fixture Proposal is unavailable")
    },
    requestProposalApply: async () => {
      throw new CodingApplicationError("invalid_request", "fixture Proposal is unavailable")
    },
    applyProposal: async () => {
      throw new CodingApplicationError("invalid_request", "fixture Proposal is unavailable")
    },
    undoProposal: async () => {
      throw new CodingApplicationError("invalid_request", "fixture Proposal is unavailable")
    },
    readEvents: async () => ({
      streamId: "packaged_remote_coding_stream",
      events: [],
      firstRetainedSequence: 1,
      lastSequence: 0,
      gap: false,
      hasMore: false,
    }),
    subscribe: () => () => {},
  }
  return application
}

function codingProject() {
  return {
    projectId: WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID,
    name: "Packaged Remote Project",
    state: "ready",
    openedAt: 1,
    recovery: {
      transactionAttention: false,
      taskAttentionCount: 0,
      taskFailureCount: 0,
      moreTasksPending: false,
    },
  }
}

async function recordRequest(request, path, requests) {
  requests.push({
    path,
    method: request.method ?? "",
    authorized: typeof request.headers.authorization === "string" &&
      request.headers.authorization === `Bearer ${WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL}`,
  })
}

async function createTestCertificate() {
  const directory = await mkdtemp(join(tmpdir(), "wanex-packaged-remote-tls-"))
  const keyPath = join(directory, "localhost.key")
  const certPath = join(directory, "localhost.crt")
  try {
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath, "-out", certPath, "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ])
    return { directory, keyPath, certPath }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw new Error("packaged Remote Coding proof requires openssl", { cause: error })
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen({ host: "127.0.0.1", port: 0 }, resolve)
  })
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}
