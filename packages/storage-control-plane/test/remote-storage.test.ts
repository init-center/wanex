import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createCoreStore,
  OneShotSystemServiceStorageWireTransport,
  PersistentSystemServiceStorageWireTransport,
  ProtocolStorageTransport,
  type CoreStore
} from "@wanex/storage"
import {
  createStorageWireTransportPool,
  createRemoteStorageControlPlane,
  type RemoteStorageAuthenticatedSubject
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/storage-control-plane", () => {
  it("authenticates and forwards storage envelopes to server-derived stores", async () => {
    const context = await createControlPlaneFixture()
    const response = await context.controlPlane.handle({
      method: "POST",
      headers: { authorization: "Bearer alpha-token" },
      body: remoteRequest({
        command: "put-config",
        key: "profile.marker",
        value: { profile: "alpha" }
      })
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true })

    const alpha = context.clientFor("alpha-token")
    await expect(alpha.getConfig("profile.marker")).resolves.toEqual({
      profile: "alpha"
    })
  })

  it("denies missing and invalid bearer tokens without resolving a store", async () => {
    const context = await createControlPlaneFixture()
    const missing = await context.controlPlane.handle({
      method: "POST",
      headers: {},
      body: { request: { command: "doctor" } }
    })
    const invalid = await context.controlPlane.handle({
      method: "POST",
      headers: { authorization: "Bearer nope" },
      body: { request: { command: "doctor" } }
    })

    expect(missing.status).toBe(401)
    expect(invalid.status).toBe(401)
    expect(context.resolvedSubjects).toEqual([])
  })

  it("rejects client-supplied store selectors", async () => {
    const context = await createControlPlaneFixture()
    const response = await context.controlPlane.handle({
      method: "POST",
      headers: { authorization: "Bearer alpha-token" },
      body: {
        ...remoteRequest({ command: "doctor" }),
        storeDir: "/tmp/forbidden",
      }
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: "client_store_selector_forbidden",
        message: "remote storage clients cannot select stores"
      }
    })
    expect(context.resolvedSubjects).toEqual([])
  })

  it("isolates stores across authenticated subjects", async () => {
    const context = await createControlPlaneFixture()
    await context.controlPlane.handle({
      method: "POST",
      headers: { authorization: "Bearer alpha-token" },
      body: remoteRequest({
        command: "put-config",
        key: "profile.marker",
        value: { profile: "alpha" }
      })
    })

    const betaGet = await context.controlPlane.handle({
      method: "POST",
      headers: { authorization: "Bearer beta-token" },
      body: remoteRequest({
        command: "get-config",
        key: "profile.marker"
      })
    })

    expect(betaGet.status).toBe(200)
    expect(betaGet.body).toMatchObject({
      storage_rpc_version: 1,
      request_id: "rpc_control_plane_test",
      ok: true,
      value: null
    })
    await expect(
      context.clientFor("alpha-token").doctor()
    ).resolves.toMatchObject({
      storePath: join(context.storeRoot, "alpha/state.db")
    })
    await expect(
      context.clientFor("beta-token").doctor()
    ).resolves.toMatchObject({
      storePath: join(context.storeRoot, "beta/state.db")
    })
  })

  it("does not leak bearer tokens in control-plane errors", async () => {
    const context = await createControlPlaneFixture()
    const response = await context.controlPlane.handle({
      method: "GET",
      headers: { authorization: "Bearer secret-token" },
      body: { request: { command: "doctor" } }
    })

    expect(JSON.stringify(response.body)).not.toContain("secret-token")
  })

  it("deduplicates concurrent transport creation per authenticated subject", async () => {
    let createCalls = 0
    let closeCalls = 0
    const transport = {
      async exchange() {
        return { ok: true, value: null }
      },
      async close() {
        closeCalls += 1
      }
    }
    const pool = createStorageWireTransportPool<TestSubject>({
      async createTransport() {
        createCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return transport
      }
    })

    const [first, second] = await Promise.all([
      pool.resolveStorageWireTransport({ subjectId: "alpha" }),
      pool.resolveStorageWireTransport({ subjectId: "alpha" })
    ])

    expect(first).toBe(transport)
    expect(second).toBe(transport)
    expect(createCalls).toBe(1)

    await pool.close()
    expect(closeCalls).toBe(1)
  })

  it("handles concurrent same-subject requests through one persistent transport", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "wanex-control-plane-pool-"))
    tempDirs.push(storeRoot)
    let createCalls = 0
    const pool = createStorageWireTransportPool<TestSubject>({
      createTransport(subject) {
        createCalls += 1
        return new PersistentSystemServiceStorageWireTransport({
          storeDir: join(storeRoot, subject.subjectId),
          serviceBin
        })
      }
    })
    const controlPlane = createRemoteStorageControlPlane<TestSubject>({
      async authenticateBearerToken(token) {
        return token === "alpha-token" ? { subjectId: "alpha" } : null
      },
      resolveStorageWireTransport: pool.resolveStorageWireTransport
    })

    try {
      const [first, second] = await Promise.all([
        controlPlane.handle({
          method: "POST",
          headers: { authorization: "Bearer alpha-token" },
          body: remoteRequest({
            command: "put-config",
            key: "concurrent.first",
            value: { order: 1 }
          })
        }),
        controlPlane.handle({
          method: "POST",
          headers: { authorization: "Bearer alpha-token" },
          body: remoteRequest({
            command: "put-config",
            key: "concurrent.second",
            value: { order: 2 }
          })
        })
      ])

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(createCalls).toBe(1)

      const getFirst = await controlPlane.handle({
        method: "POST",
        headers: { authorization: "Bearer alpha-token" },
        body: remoteRequest({
          command: "get-config",
          key: "concurrent.first"
        })
      })
      const getSecond = await controlPlane.handle({
        method: "POST",
        headers: { authorization: "Bearer alpha-token" },
        body: remoteRequest({
          command: "get-config",
          key: "concurrent.second"
        })
      })

      expect(getFirst.body).toMatchObject({ ok: true, value: { order: 1 } })
      expect(getSecond.body).toMatchObject({ ok: true, value: { order: 2 } })
    } finally {
      await pool.close()
    }
  })
})

async function createControlPlaneFixture(): Promise<{
  readonly controlPlane: ReturnType<typeof createRemoteStorageControlPlane<TestSubject>>
  readonly storeRoot: string
  readonly resolvedSubjects: string[]
  readonly clientFor: (token: string) => CoreStore
}> {
  const storeRoot = await mkdtemp(join(tmpdir(), "wanex-control-plane-"))
  tempDirs.push(storeRoot)
  const subjectsByToken = new Map<string, TestSubject>([
    ["alpha-token", { subjectId: "alpha" }],
    ["beta-token", { subjectId: "beta" }]
  ])
  const resolvedSubjects: string[] = []
  const controlPlane = createRemoteStorageControlPlane<TestSubject>({
    async authenticateBearerToken(token) {
      return subjectsByToken.get(token) ?? null
    },
    async resolveStorageWireTransport(subject) {
      resolvedSubjects.push(subject.subjectId)
      return new OneShotSystemServiceStorageWireTransport({
        storeDir: join(storeRoot, subject.subjectId),
        serviceBin
      })
    }
  })

  return {
    controlPlane,
    storeRoot,
    resolvedSubjects,
    clientFor(token) {
      const subject = subjectsByToken.get(token)
      if (subject === undefined) {
        throw new Error(`unknown token: ${token}`)
      }
      return createCoreStore(
        new ProtocolStorageTransport(new OneShotSystemServiceStorageWireTransport({
          storeDir: join(storeRoot, subject.subjectId),
          serviceBin
        }), { negotiation: "oneshot" })
      )
    }
  }
}

interface TestSubject extends RemoteStorageAuthenticatedSubject {
  readonly subjectId: "alpha" | "beta"
}

function remoteRequest(request: Record<string, unknown>) {
  return {
    request: {
      storage_rpc_version: 1,
      request_id: "rpc_control_plane_test",
      request
    }
  }
}
