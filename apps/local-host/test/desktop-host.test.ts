import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  startDesktopMainHost,
  type DesktopMainHost
} from "@wanex/local-host/desktop-host"
import { containsSensitiveText } from "../src/sensitive-value.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const hosts: DesktopMainHost[] = []

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

describe("@wanex/local-host/desktop-host", () => {
  it("starts a trusted desktop main-process host with a safe snapshot", async () => {
    const storeDir = await tempDir("wanex-desktop-host-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint("desktop-host-test", "desktop-host-model")
        ]
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    const snapshot = await host.readSnapshot()
    expect(snapshot).toMatchObject({
      kind: "desktop.snapshot",
      url: host.url,
      local: {
        kind: "local-host.snapshot",
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
    expect(containsSensitiveText(snapshot, storeDir)).toBe(false)
    expect(containsSensitiveText(snapshot, serviceBin)).toBe(false)
  })

  it("handles web application request envelopes for desktop IPC adapters", async () => {
    const storeDir = await tempDir("wanex-desktop-host-ipc-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint("desktop-host-ipc", "desktop-host-ipc-model")
        ]
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    const snapshot = await host.handleWebRequest({
      kind: "web.request",
      operation: "snapshot",
      requestId: "desktop_host_snapshot"
    })
    expect(snapshot).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "snapshot",
      requestId: "desktop_host_snapshot",
      snapshot: {
        view: {
          ready: true
        }
      }
    })

    const conversation = await host.handleWebRequest({
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "desktop_host_start_workbench",
      action: {
        type: "submit-conversation",
        input: {
          text: "hello from desktop host"
        }
      }
    })
    expect(conversation).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "desktop_host_start_workbench",
      actionResult: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product.conversation-operation"
            }
          },
          view: {
            selectedSessionTitle: "hello from desktop host"
          }
        }
      }
    })
    expect(containsSensitiveText(conversation, storeDir)).toBe(false)
    expect(containsSensitiveText(conversation, serviceBin)).toBe(false)
  })

  it("returns web application request errors without throwing", async () => {
    const storeDir = await tempDir("wanex-desktop-host-error-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    await expect(host.handleWebRequest({
      kind: "web.request",
      operation: "unknown",
      requestId: "desktop_host_unknown"
    })).resolves.toMatchObject({
      kind: "web.response",
      ok: false,
      operation: "unknown",
      requestId: "desktop_host_unknown",
      error: {
        code: "unknown_operation"
      }
    })
  })

  it("handles structured desktop host requests for IPC adapters", async () => {
    const storeDir = await tempDir("wanex-desktop-host-request-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint(
            "desktop-host-request-initial",
            "desktop-host-request-initial-model"
          )
        ]
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    await host.modelEndpoints.upsertModelEndpoint({
      modelEndpoint: fakeEndpoint(
        "desktop-host-request-second",
        "desktop-host-request-second-model",
        "env://DESKTOP_HOST_TEST_SECRET"
      )
    })

    const snapshot = await host.handleRequest({
      kind: "desktop.request",
      operation: "snapshot",
      requestId: "desktop_host_snapshot"
    })
    expect(snapshot).toMatchObject({
      kind: "desktop.response",
      ok: true,
      operation: "snapshot",
      requestId: "desktop_host_snapshot",
      snapshot: {
        kind: "desktop.snapshot",
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
          exposesRawStorageClient: false,
          exposesRendererMutationApi: false
        }
      }
    })

    const endpoints = await host.handleRequest({
      kind: "desktop.request",
      operation: "listModelEndpoints",
      requestId: "desktop_host_endpoints"
    })
    expect(endpoints).toMatchObject({
      kind: "desktop.response",
      ok: true,
      operation: "listModelEndpoints",
      requestId: "desktop_host_endpoints",
      modelEndpoints: {
        activeEndpointId: "desktop-host-request-initial",
        endpoints: expect.arrayContaining([
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
      kind: "desktop.request",
      operation: "setActiveModelEndpoint",
      requestId: "desktop_host_select_endpoint",
      input: {
        endpointId: "desktop-host-request-second"
      }
    })
    expect(selected).toMatchObject({
      kind: "desktop.response",
      ok: true,
      operation: "setActiveModelEndpoint",
      requestId: "desktop_host_select_endpoint",
      modelEndpoint: {
        id: "desktop-host-request-second",
        active: true,
        credentialConfigured: true,
      }
    })

    const rejectedMutation = await host.handleRequest({
      kind: "desktop.request",
      operation: "upsertModelEndpoint",
      requestId: "desktop_host_reject_provider_upsert",
      input: {
        modelEndpoint: openAIEndpoint({
          id: "desktop-host-rejected-provider",
          modelId: "desktop-host-rejected-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: "env://DESKTOP_HOST_REJECTED_SECRET"
        }),
        makeActive: true
      }
    })
    expect(rejectedMutation).toMatchObject({
      kind: "desktop.response",
      ok: false,
      operation: "upsertModelEndpoint",
      requestId: "desktop_host_reject_provider_upsert",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    const rejectedSetup = await host.handleRequest({
      kind: "desktop.request",
      operation: "configureModelEndpoint",
      requestId: "desktop_host_reject_provider_setup",
      input: {
        ...openAIEndpoint({
          id: "desktop-host-rejected-setup",
          modelId: "desktop-host-rejected-setup-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: "env://DESKTOP_HOST_REJECTED_SETUP_SECRET"
        }),
        makeActive: true
      }
    })
    expect(rejectedSetup).toMatchObject({
      kind: "desktop.response",
      ok: false,
      operation: "configureModelEndpoint",
      requestId: "desktop_host_reject_provider_setup",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    const conversation = await host.handleRequest({
      kind: "desktop.request",
      operation: "webRequest",
      requestId: "desktop_host_web_request",
      request: {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "desktop_host_envelope_start_workbench",
        action: {
          type: "submit-conversation",
          input: {
            text: "hello from desktop host request envelope"
          }
        }
      }
    })
    expect(conversation).toMatchObject({
      kind: "desktop.response",
      ok: true,
      operation: "webRequest",
      requestId: "desktop_host_web_request",
      webResponse: {
        kind: "web.response",
        ok: true,
        operation: "dispatchAction",
        requestId: "desktop_host_envelope_start_workbench",
        actionResult: {
          snapshot: {
              conversation: {
                operation: {
                  kind: "product.conversation-operation"
                }
              },
              view: {
                selectedSessionTitle: "hello from desktop host request envelope"
              }
            }
        }
      }
    })

    const rendererValues = [
      snapshot,
      endpoints,
      selected,
      rejectedMutation,
      rejectedSetup,
      conversation
    ]
    const serialized = JSON.stringify(rendererValues)
    expect(containsSensitiveText(rendererValues, storeDir)).toBe(false)
    expect(containsSensitiveText(rendererValues, serviceBin)).toBe(false)
    expect(serialized).not.toContain("DESKTOP_HOST_TEST_SECRET")
    expect(serialized).not.toContain("secret-from-rejected-request")
    expect(serialized).not.toContain("secret-from-rejected-setup")
  })

  it("configures providers through the trusted desktop host setup facade", async () => {
    const storeDir = await tempDir("wanex-desktop-host-setup-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint(
            "desktop-host-setup-initial",
            "desktop-host-setup-initial-model"
          )
        ]
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    const result = await host.modelEndpoints.upsertModelEndpoint({
      modelEndpoint: openAIEndpoint({
        id: "desktop-host-setup-openai",
        modelId: "desktop-host-setup-openai-model",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "env://DESKTOP_HOST_SETUP_SECRET"
      }),
      makeActive: true
    })
    expect(result).toMatchObject({
      id: "desktop-host-setup-openai",
      active: true,
      credentialConfigured: true,
    })

    const snapshot = await host.readSnapshot()
    expect(snapshot.local.web.view.settings.profile.readiness).toMatchObject({
      status: "ready",
      activeEndpointId: "desktop-host-setup-openai",
      canRun: true
    })

    const rendererValues = [result, snapshot]
    const serialized = JSON.stringify(rendererValues)
    expect(serialized).not.toContain("DESKTOP_HOST_SETUP_SECRET")
    expect(containsSensitiveText(rendererValues, storeDir)).toBe(false)
    expect(containsSensitiveText(rendererValues, serviceBin)).toBe(false)
  })

  it("returns structured desktop host request errors", async () => {
    const storeDir = await tempDir("wanex-desktop-host-request-error-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
      }
    })
    hosts.push(host)

    await expect(host.handleRequest("bad")).resolves.toMatchObject({
      kind: "desktop.response",
      ok: false,
      error: {
        code: "invalid_request",
        field: "request"
      }
    })

    await expect(host.handleRequest({
      kind: "desktop.request",
      operation: "missing",
      requestId: "desktop_host_missing_operation"
    })).resolves.toMatchObject({
      kind: "desktop.response",
      ok: false,
      operation: "missing",
      requestId: "desktop_host_missing_operation",
      error: {
        code: "unknown_operation",
        field: "operation"
      }
    })

    await expect(host.handleRequest({
      kind: "desktop.request",
      operation: "setActiveModelEndpoint",
      requestId: "desktop_host_missing_endpoint",
      input: {
        endpointId: "does-not-exist"
      }
    })).resolves.toMatchObject({
      kind: "desktop.response",
      ok: false,
      operation: "setActiveModelEndpoint",
      requestId: "desktop_host_missing_endpoint",
      error: {
        code: "host_error",
        message: "model endpoint not found: does-not-exist"
      }
    })
  })

  it("closes resources idempotently", async () => {
    const storeDir = await tempDir("wanex-desktop-host-close-")
    const host = await startDesktopMainHost({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      web: {
        hostname: "127.0.0.1",
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

function fakeEndpoint(id: string, modelId: string, secretRef?: string) {
  return {
    id,
    connection: {
      id,
      providerId: "fake",
      ...(secretRef === undefined ? {} : { secretRef })
    },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: `desktop-host.test.${id}`,
        revision: "1"
      }
    }
  } as const
}

function openAIEndpoint(request: {
  readonly id: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef?: string
}) {
  return {
    id: request.id,
    connection: {
      id: request.id,
      providerId: "openai-compatible",
      baseUrl: request.baseUrl,
      ...(request.secretRef === undefined
        ? {}
        : { secretRef: request.secretRef })
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: request.modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: `desktop-host.test.${request.id}`,
        revision: "1"
      }
    }
  } as const
}
