import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  startProductAppDesktopMainHost,
  type ProductAppDesktopMainHost
} from "@wanex/product-app-local/desktop-host"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const hosts: ProductAppDesktopMainHost[] = []

afterEach(async () => {
  while (hosts.length > 0) {
    await hosts.pop()?.close()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/product-app-local/desktop-host", () => {
  it("starts a trusted desktop main-process host with a safe snapshot", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "desktop-host-test",
            modelId: "desktop-host-model"
          }
        ]
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    const snapshot = await host.readSnapshot()
    expect(snapshot).toMatchObject({
      kind: "product-app-desktop-main.snapshot",
      url: host.url,
      local: {
        kind: "product-app-local.snapshot",
        url: host.url,
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
          exposesRawStorageClient: false,
          exposesRendererMutationApi: false
        }
      },
      privacy: {
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawStorageClient: false,
        exposesRendererMutationApi: false
      }
    })
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain(storeDir)
    expect(serialized).not.toContain(serviceBin)
  })

  it("handles Product App Web request envelopes for desktop IPC adapters", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-ipc-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "desktop-host-ipc",
            modelId: "desktop-host-ipc-model"
          }
        ]
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    const document = await host.handleWebRequest({
      kind: "product-app-web.request",
      operation: "document",
      requestId: "desktop_host_document"
    })
    expect(document).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "document",
      requestId: "desktop_host_document",
      document: {
        snapshot: {
          view: {
            ready: true
          }
        }
      }
    })

    const conversation = await host.handleWebRequest({
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "desktop_host_start_workbench",
      input: {
        action: "submit-conversation",
        fields: {
          text: "hello from desktop host"
        }
      },
      options: {
        pollAfterAction: false
      }
    })
    expect(conversation).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "desktop_host_start_workbench",
      document: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product-app.conversation-operation"
            }
          },
          view: {
            selectedSessionTitle: "hello from desktop host"
          }
        }
      }
    })
    const serialized = JSON.stringify(conversation)
    expect(serialized).not.toContain(storeDir)
    expect(serialized).not.toContain(serviceBin)
  })

  it("returns Product App Web request errors without throwing", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-error-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    await expect(host.handleWebRequest({
      kind: "product-app-web.request",
      operation: "unknown",
      requestId: "desktop_host_unknown"
    })).resolves.toMatchObject({
      kind: "product-app-web.response",
      ok: false,
      operation: "unknown",
      requestId: "desktop_host_unknown",
      error: {
        code: "unknown_operation"
      },
      document: {
        kind: "product-app-web.document"
      }
    })
  })

  it("handles structured desktop host requests for IPC adapters", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-request-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "desktop-host-request-initial",
            modelId: "desktop-host-request-initial-model"
          }
        ]
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    await host.providerProfiles.upsertProviderProfile({
      profile: {
        id: "desktop-host-request-second",
        kind: "fake",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "fake",
        modelId: "desktop-host-request-second-model",
        secretRef: "env://DESKTOP_HOST_TEST_SECRET"
      }
    })

    const snapshot = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "snapshot",
      requestId: "desktop_host_snapshot"
    })
    expect(snapshot).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: true,
      operation: "snapshot",
      requestId: "desktop_host_snapshot",
      snapshot: {
        kind: "product-app-desktop-main.snapshot",
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
          exposesRawStorageClient: false,
          exposesRendererMutationApi: false
        }
      }
    })

    const profiles = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "listProviderProfiles",
      requestId: "desktop_host_profiles"
    })
    expect(profiles).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: true,
      operation: "listProviderProfiles",
      requestId: "desktop_host_profiles",
      providerProfiles: {
        activeProfileId: "desktop-host-request-initial",
        profiles: expect.arrayContaining([
          expect.objectContaining({
            id: "desktop-host-request-initial",
            active: true,
            credentialConfigured: false
          }),
          expect.objectContaining({
            id: "desktop-host-request-second",
            active: false,
            credentialConfigured: true,
          })
        ])
      }
    })

    const selected = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "setActiveProviderProfile",
      requestId: "desktop_host_select_profile",
      input: {
        profileId: "desktop-host-request-second"
      }
    })
    expect(selected).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: true,
      operation: "setActiveProviderProfile",
      requestId: "desktop_host_select_profile",
      providerProfile: {
        id: "desktop-host-request-second",
        active: true,
        credentialConfigured: true,
      }
    })

    const rejectedMutation = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "upsertProviderProfile",
      requestId: "desktop_host_reject_provider_upsert",
      input: {
        profile: {
          id: "desktop-host-rejected-provider",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "desktop-host-rejected-model",
          apiKey: "secret-from-rejected-request"
        },
        makeActive: true
      }
    })
    expect(rejectedMutation).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: false,
      operation: "upsertProviderProfile",
      requestId: "desktop_host_reject_provider_upsert",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    const rejectedSetup = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "configureProviderProfile",
      requestId: "desktop_host_reject_provider_setup",
      input: {
        id: "desktop-host-rejected-setup",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "desktop-host-rejected-setup-model",
        baseUrl: "https://provider.example.test/v1",
        apiKey: "secret-from-rejected-setup",
        makeActive: true
      }
    })
    expect(rejectedSetup).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: false,
      operation: "configureProviderProfile",
      requestId: "desktop_host_reject_provider_setup",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    const conversation = await host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "webRequest",
      requestId: "desktop_host_web_request",
      request: {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "desktop_host_envelope_start_workbench",
        input: {
          action: "submit-conversation",
          fields: {
            text: "hello from desktop host request envelope"
          }
        },
        options: {
          pollAfterAction: false
        }
      }
    })
    expect(conversation).toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: true,
      operation: "webRequest",
      requestId: "desktop_host_web_request",
      webResponse: {
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        requestId: "desktop_host_envelope_start_workbench",
        document: {
          snapshot: {
            conversation: {
              operation: {
                kind: "product-app.conversation-operation"
              }
            },
            view: {
              selectedSessionTitle: "hello from desktop host request envelope"
            }
          }
        }
      }
    })

    const serialized = JSON.stringify([
      snapshot,
      profiles,
      selected,
      rejectedMutation,
      rejectedSetup,
      conversation
    ])
    expect(serialized).not.toContain(storeDir)
    expect(serialized).not.toContain(serviceBin)
    expect(serialized).not.toContain("DESKTOP_HOST_TEST_SECRET")
    expect(serialized).not.toContain("secret-from-rejected-request")
    expect(serialized).not.toContain("secret-from-rejected-setup")
  })

  it("configures providers through the trusted desktop host setup facade", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-setup-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      providerProfiles: {
        profiles: [
          {
            id: "desktop-host-setup-initial",
            modelId: "desktop-host-setup-initial-model"
          }
        ]
      },
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    const result = await host.providerSetup.configureProviderProfile({
      id: "desktop-host-setup-openai",
      kind: "openai-compatible",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "openai-compatible",
      modelId: "desktop-host-setup-openai-model",
      baseUrl: "https://provider.example.test/v1",
      secretRef: "env://DESKTOP_HOST_SETUP_SECRET",
      makeActive: true
    })
    expect(result).toMatchObject({
      kind: "product-app-local.provider-setup.configured",
      profile: {
        id: "desktop-host-setup-openai",
        active: true,
        credentialConfigured: true,
      },
      readiness: {
        status: "ready",
        activeProfileId: "desktop-host-setup-openai",
        canRun: true,
        requiresCredential: true,
        credentialConfigured: true
      }
    })

    const snapshot = await host.readSnapshot()
    expect(snapshot.local.web.view.settings.profile.readiness).toMatchObject({
      status: "ready",
      activeProfileId: "desktop-host-setup-openai",
      canRun: true
    })

    const serialized = JSON.stringify([result, snapshot])
    expect(serialized).not.toContain("DESKTOP_HOST_SETUP_SECRET")
    expect(serialized).not.toContain(storeDir)
    expect(serialized).not.toContain(serviceBin)
  })

  it("returns structured desktop host request errors", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-request-error-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })
    hosts.push(host)

    await expect(host.handleRequest("bad")).resolves.toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: false,
      error: {
        code: "invalid_request",
        field: "request"
      }
    })

    await expect(host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "missing",
      requestId: "desktop_host_missing_operation"
    })).resolves.toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: false,
      operation: "missing",
      requestId: "desktop_host_missing_operation",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    await expect(host.handleRequest({
      kind: "product-app-desktop-main.request",
      operation: "setActiveProviderProfile",
      requestId: "desktop_host_missing_profile",
      input: {
        profileId: "does-not-exist"
      }
    })).resolves.toMatchObject({
      kind: "product-app-desktop-main.response",
      ok: false,
      operation: "setActiveProviderProfile",
      requestId: "desktop_host_missing_profile",
      error: {
        code: "host_error",
        message: "provider profile not found: does-not-exist"
      }
    })
  })

  it("closes resources idempotently", async () => {
    const storeDir = await tempDir("wanex-product-app-desktop-host-close-")
    const host = await startProductAppDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
        pollIntervalMs: 0
      }
    })

    await expect(host.close()).resolves.toBeUndefined()
    await expect(host.close()).resolves.toBeUndefined()
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
