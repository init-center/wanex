import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createStorageHandle } from "@wanex/storage"
import { createWanexRuntime } from "../src/index.js"
import {
  EnvSecretProvider,
  SecretResolver
} from "../src/secrets/index.js"
import {
  fakeModelEndpoint,
  testModelEndpoint
} from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("@wanex/runtime", () => {
  it("owns storage, provider setup, foreground runs, and disposal", async () => {
    const runtime = await createRuntime("foreground response")

    try {
      expect(runtime.status()).toMatchObject({
        disposed: false,
        started: false,
        workerCount: 1,
        modelEndpointId: "endpoint_public-runtime",
        protocolId: "fake",
        providerId: "fake",
        modelId: "public-runtime-model"
      })

      const result = await runtime.run({
        content: [{ type: "text", text: "hello public runtime" }],
        sessionId: "ses_public_runtime"
      })
      expect(result).toMatchObject({
        sessionId: "ses_public_runtime",
        inputId: expect.any(String),
        turnId: expect.any(String),
        jobId: expect.any(String),
        state: "succeeded",
        assistantText: "foreground response",
        messageCount: 2,
        workerResults: ["completed"]
      })
    } finally {
      await runtime.dispose()
      await runtime.dispose()
    }

    expect(runtime.status().disposed).toBe(true)
    await expect(runtime.run({ content: [{ type: "text", text: "after dispose" }] })).rejects.toThrow(
      "wanex runtime is disposed"
    )
  })

  it("separates restartable background stop from final dispose", async () => {
    const runtime = await createRuntime("background response")
    try {
      runtime.start()
      expect(runtime.status().started).toBe(true)
      await runtime.submit({
        content: [{ type: "text", text: "background" }],
        sessionId: "ses_public_runtime_background"
      })
      await delay(40)
      await runtime.stop()
      expect(runtime.status().started).toBe(false)
      expect(runtime.health(1234)).toMatchObject({
        generatedAt: 1234,
        started: false,
        workerCount: 1,
        activeLoopCount: 0
      })

      const result = await runtime.run({
        content: [{ type: "text", text: "foreground after stop" }],
        sessionId: "ses_public_runtime_after_stop"
      })
      expect(result.state).toBe("succeeded")
    } finally {
      await runtime.dispose()
    }
  })

  it("borrows injected storage without closing its handle", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-injected-"))
    tempDirs.push(storeDir)
    const storage = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const runtime = await createWanexRuntime({
      storage: {
        kind: "injected",
        handle: storage
      },
      modelEndpoint: fakeModelEndpoint("borrowed-storage")
    })

    try {
      await runtime.dispose()
      await expect(storage.core.doctor()).resolves.toMatchObject({
        schemaVersion: 21
      })
    } finally {
      await runtime.dispose()
      await storage.dispose()
    }
  })

  it("resolves an env secret ref for a durable real-provider run", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-secret-ref-"))
    tempDirs.push(storeDir)
    const secretValue = "runtime-provider-secret"
    const observedAuthorizations: string[] = []
    vi.stubGlobal("fetch", async (_input: string, init: {
      readonly headers: Readonly<Record<string, string>>
    }) => {
      observedAuthorizations.push(init.headers.authorization ?? "")
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        body: (async function* () {
          yield 'data: {"choices":[{"delta":{"content":"resolved"},"finish_reason":"stop"}]}\n\n'
          yield "data: [DONE]\n\n"
        })(),
        async text() {
          return ""
        }
      }
    })

    const runtime = await createWanexRuntime({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir,
        serviceBin
      },
      modelEndpoint: testModelEndpoint({
        endpointId: "runtime-secret-ref",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "runtime-secret-ref-model",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "env://WANEX_RUNTIME_PROVIDER_KEY"
      }),
      secretResolver: new SecretResolver([
        new EnvSecretProvider({
          WANEX_RUNTIME_PROVIDER_KEY: secretValue
        })
      ])
    })

    try {
      await expect(runtime.run({ content: [{ type: "text", text: "resolve provider credential" }] }))
        .resolves.toMatchObject({
          state: "succeeded",
          assistantText: "resolved"
        })
      expect(observedAuthorizations).toEqual([`Bearer ${secretValue}`])
      expect((await readFile(join(storeDir, "state.db"))).includes(secretValue))
        .toBe(false)
    } finally {
      await runtime.dispose()
    }
  })

  it("fails fast when a real provider has no secret resolver", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-no-resolver-"))
    tempDirs.push(storeDir)
    await expect(createWanexRuntime({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir,
        serviceBin
      },
      modelEndpoint: testModelEndpoint({
        endpointId: "runtime-no-resolver",
        protocolId: "openai-chat-completions",
        providerId: "openai",
        modelId: "runtime-no-resolver-model",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "env://WANEX_RUNTIME_PROVIDER_KEY"
      })
    })).rejects.toThrow("model endpoint requires secret resolver")
    await expect(access(join(storeDir, "state.db"))).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("validates real provider metadata before opening storage", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-invalid-provider-"))
    tempDirs.push(storeDir)
    const secretResolver = new SecretResolver([])
    const storage = {
      kind: "local-system-service" as const,
      mode: "persistent" as const,
      storeDir,
      serviceBin
    }

    await expect(createWanexRuntime({
      storage,
      modelEndpoint: testModelEndpoint({
        endpointId: "runtime-missing-base-url",
        protocolId: "openai-chat-completions",
        providerId: "openai",
        modelId: "runtime-missing-base-url",
        secretRef: "env://WANEX_RUNTIME_PROVIDER_KEY"
      }),
      secretResolver
    })).rejects.toThrow("model endpoint requires baseUrl")
    await expect(createWanexRuntime({
      storage,
      modelEndpoint: testModelEndpoint({
        endpointId: "runtime-missing-secret-ref",
        protocolId: "openai-chat-completions",
        providerId: "openai",
        modelId: "runtime-missing-secret-ref",
        baseUrl: "https://provider.example.test/v1"
      }),
      secretResolver
    })).rejects.toThrow("model endpoint requires secretRef")
    await expect(createWanexRuntime({
      storage,
      modelEndpoint: testModelEndpoint({
        endpointId: "runtime-invalid-secret-ref",
        protocolId: "openai-chat-completions",
        providerId: "openai",
        modelId: "runtime-invalid-secret-ref",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "missing-scheme"
      }),
      secretResolver
    })).rejects.toThrow("secretRef must include a URI scheme")
    await expect(access(join(storeDir, "state.db"))).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("reads and cancels an exact durable operation reference", async () => {
    const runtime = await createRuntime("must not run")
    try {
      const submitted = await runtime.submit({
        content: [{ type: "text", text: "cancel before a worker claims this turn" }],
        sessionId: "ses_public_runtime_cancel"
      })
      expect(submitted).toMatchObject({
        sessionId: "ses_public_runtime_cancel",
        inputId: expect.any(String),
        turnId: expect.any(String),
        jobId: expect.any(String)
      })
      await expect(runtime.readOperation(submitted)).resolves.toMatchObject({
        kind: "found",
        operation: {
          ...submitted,
          state: "queued",
          assistantText: "",
          messageCount: 0
        }
      })
      await expect(runtime.readOperation({
        ...submitted,
        inputId: "inp_wrong"
      })).resolves.toEqual({
        kind: "missing",
        reference: {
          ...submitted,
          inputId: "inp_wrong"
        }
      })
      await expect(runtime.cancelOperation({
        ...submitted,
        reason: "user cancelled"
      })).resolves.toEqual({
        ...submitted,
        status: "cancelled"
      })
      await expect(runtime.readOperation(submitted)).resolves.toMatchObject({
        kind: "found",
        operation: {
          ...submitted,
          state: "cancelled"
        }
      })
    } finally {
      await runtime.dispose()
    }
  })
})

async function createRuntime(responseText: string) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-public-runtime-"))
  tempDirs.push(storeDir)
  return await createWanexRuntime({
    storage: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    },
    modelEndpoint: {
      ...fakeModelEndpoint("public-runtime"),
      model: {
        ...fakeModelEndpoint("public-runtime").model,
        id: "public-runtime-model"
      }
    },
    fakeResponseText: responseText,
    idleIntervalMs: 5
  })
}
