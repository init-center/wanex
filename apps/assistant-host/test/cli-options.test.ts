import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createLocalBrowserOpenCommand,
  openLocalBrowser,
  parseLocalCliBoolean,
  parseLocalCliOptions,
  parseLocalCliPort,
  parseLocalCliSummaryFormat
} from "../src/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/assistant-host CLI options", () => {
  it("parses explicit store-dir startup options", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--",
          "--hostname",
          "0.0.0.0",
          "--port",
          "57015",
          "--store-dir",
          "./store",
          "--service-bin",
          "./target/custom-system-service"
        ],
        env: {}
      })
    ).toEqual({
      open: false,
      smoke: false,
      setupProvider: false,
      summaryFormat: "text",
      hostname: "0.0.0.0",
      port: 57015,
      serviceBin: resolve("/repo/target/custom-system-service"),
      storage: {
        kind: "store-dir",
        storeDir: resolve("/repo/store")
      },
      modelEndpoints: {
        endpoints: []
      }
    })
  })

  it("defaults to local profile storage and system-service artifact path", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/workspace/assistant",
        artifactRoot: "/workspace/wanex",
        args: [],
        env: {}
      })
    ).toEqual({
      open: false,
      smoke: false,
      setupProvider: false,
      summaryFormat: "text",
      hostname: "127.0.0.1",
      serviceBin: resolve(
        `/workspace/wanex/target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
      ),
      storage: {
        kind: "profile",
        rootDir: resolve("/workspace/assistant/.wanex-assistant-host"),
        profileId: "default"
      },
      modelEndpoints: {
        endpoints: []
      }
    })
  })

  it("parses profile storage from environment", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_HOSTNAME: "127.0.0.2",
          WANEX_ASSISTANT_HOST_PORT: "57016",
          WANEX_ASSISTANT_HOST_PROFILE_ROOT: "./profiles",
          WANEX_ASSISTANT_HOST_PROFILE_ID: "work",
          WANEX_SYSTEM_SERVICE_BIN: "./target/env-system-service",
          WANEX_ASSISTANT_HOST_OPEN: "yes",
          WANEX_ASSISTANT_HOST_SMOKE: "true",
          WANEX_ASSISTANT_HOST_SUMMARY_FORMAT: "json",
          WANEX_PROVIDER_PROTOCOL: "fake",
          WANEX_PROVIDER_ID: "fake",
          WANEX_MODEL_ENDPOINT_ID: "fallback-endpoint",
          WANEX_PROVIDER_MODEL_ID: "fallback-model"
        }
      })
    ).toEqual({
      open: true,
      smoke: true,
      setupProvider: false,
      summaryFormat: "json",
      hostname: "127.0.0.2",
      port: 57016,
      serviceBin: resolve("/repo/target/env-system-service"),
      storage: {
        kind: "profile",
        rootDir: resolve("/repo/profiles"),
        profileId: "work"
      },
      modelEndpoints: {
        endpoints: [fakeModelEndpoint("fallback-endpoint", "fallback-model")]
      }
    })
  })

  it("parses assistant-local model endpoint flags over environment fallbacks", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoint-id",
          "flag-endpoint",
          "--provider-protocol",
          "openai-chat-completions",
          "--provider-id",
          "flag-provider",
          "--provider-model-id",
          "flag-model",
          "--provider-base-url",
          "https://api.example.test/v1",
          "--provider-secret-ref",
          "env://TEST_PROVIDER_API_KEY"
        ],
        env: {
          WANEX_ASSISTANT_HOST_MODEL_ENDPOINT_ID: "env-endpoint",
          WANEX_ASSISTANT_HOST_PROVIDER_PROTOCOL: "fake",
          WANEX_ASSISTANT_HOST_PROVIDER_ID: "env-provider",
          WANEX_ASSISTANT_HOST_PROVIDER_MODEL_ID: "env-model",
          WANEX_ASSISTANT_HOST_PROVIDER_BASE_URL: "https://env.example.test/v1",
          TEST_PROVIDER_API_KEY: "secret-from-env"
        }
      }).modelEndpoints
    ).toEqual({
      endpoints: [
        openAIModelEndpoint({
          id: "flag-endpoint",
          providerId: "flag-provider",
          modelId: "flag-model",
          baseUrl: "https://api.example.test/v1",
          secretRef: "env://TEST_PROVIDER_API_KEY"
        })
      ]
    })
  })

  it("parses explicit browser open options", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--open"],
        env: {}
      }).open
    ).toBe(true)
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_OPEN: "0"
        }
      }).open
    ).toBe(false)
    expect(parseLocalCliBoolean("on", "TEST_BOOL")).toBe(true)
    expect(parseLocalCliBoolean("off", "TEST_BOOL")).toBe(false)
    expect(() => parseLocalCliBoolean("maybe", "TEST_BOOL"))
      .toThrow("invalid boolean for TEST_BOOL: maybe")
  })

  it("parses explicit smoke options", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke"],
        env: {}
      }).smoke
    ).toBe(true)
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_SMOKE: "0"
        }
      }).smoke
    ).toBe(false)
  })

  it("parses explicit provider setup options", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--setup-provider"],
        env: {}
      }).setupProvider
    ).toBe(true)
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_SETUP_PROVIDER: "0"
        }
      }).setupProvider
    ).toBe(false)
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke", "--setup-provider"],
        env: {}
      })
    ).toThrow("setup-provider cannot be combined with smoke")
  })

  it("parses startup summary format options", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--summary-format", "json"],
        env: {}
      }).summaryFormat
    ).toBe("json")
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_SUMMARY_FORMAT: "text"
        }
      }).summaryFormat
    ).toBe("text")
    expect(parseLocalCliSummaryFormat("JSON")).toBe("json")
    expect(parseLocalCliSummaryFormat(" text ")).toBe("text")
    expect(() => parseLocalCliSummaryFormat("yaml"))
      .toThrow("invalid summary format: yaml")
  })

  it("parses assistant-local model endpoint environment over generic fallbacks", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_ASSISTANT_HOST_MODEL_ENDPOINT_ID: "local-env-endpoint",
          WANEX_ASSISTANT_HOST_PROVIDER_PROTOCOL: "openai-chat-completions",
          WANEX_ASSISTANT_HOST_PROVIDER_ID: "local-env-provider",
          WANEX_ASSISTANT_HOST_PROVIDER_MODEL_ID: "local-env-model",
          WANEX_ASSISTANT_HOST_MODEL_INPUT_MODALITIES: "text,image",
          WANEX_ASSISTANT_HOST_MODEL_OUTPUT_MODALITIES: "text",
          WANEX_ASSISTANT_HOST_PROVIDER_BASE_URL: "https://local.example.test/v1",
          WANEX_ASSISTANT_HOST_PROVIDER_SECRET_REF: "env://LOCAL_API_KEY",
          WANEX_MODEL_ENDPOINT_ID: "generic-env-endpoint",
          WANEX_PROVIDER_PROTOCOL: "fake",
          WANEX_PROVIDER_ID: "generic-env-provider",
          WANEX_PROVIDER_MODEL_ID: "generic-env-model"
        }
      }).modelEndpoints
    ).toEqual({
      endpoints: [
        openAIModelEndpoint({
          id: "local-env-endpoint",
          providerId: "local-env-provider",
          modelId: "local-env-model",
          baseUrl: "https://local.example.test/v1",
          secretRef: "env://LOCAL_API_KEY",
          inputModalities: ["text", "image"]
        })
      ]
    })
  })

  it("parses trusted model endpoint catalog JSON with secret refs", () => {
    const catalog = JSON.stringify({
      endpoints: [
        fakeModelEndpoint("catalog-fake", "catalog-fake-model"),
        openAIModelEndpoint({
          id: "catalog-openai",
          providerId: "openai-compatible",
          modelId: "catalog-openai-model",
          baseUrl: "https://catalog.example.test/v1",
          secretRef: "env://CATALOG_API_KEY"
        })
      ],
      activeEndpointId: "catalog-openai"
    })

    expect(
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--model-endpoints-json", catalog],
        env: {}
      }).modelEndpoints
    ).toEqual({
      activeEndpointId: "catalog-openai",
      endpoints: [
        fakeModelEndpoint("catalog-fake", "catalog-fake-model"),
        openAIModelEndpoint({
          id: "catalog-openai",
          providerId: "openai-compatible",
          modelId: "catalog-openai-model",
          baseUrl: "https://catalog.example.test/v1",
          secretRef: "env://CATALOG_API_KEY"
        })
      ]
    })
  })

  it("parses trusted model endpoint catalog files with secret refs", async () => {
    const dir = await tempDir("wanex-assistant-host-endpoint-catalog-")
    const catalogPath = join(dir, "model-endpoints.json")
    await writeFile(
      catalogPath,
      JSON.stringify({
        endpoints: [
          fakeModelEndpoint("file-fake", "file-fake-model"),
          openAIModelEndpoint({
            id: "file-openai",
            providerId: "openai-compatible",
            modelId: "file-openai-model",
            baseUrl: "https://file.example.test/v1",
            secretRef: "env://FILE_API_KEY"
          })
        ],
        activeEndpointId: "file-fake"
      }),
      "utf8"
    )

    expect(
      parseLocalCliOptions({
        cwd: dir,
        artifactRoot: "/repo",
        args: [
          "--model-endpoints-file",
          "./model-endpoints.json",
          "--active-model-endpoint-id",
          "file-openai"
        ],
        env: {}
      }).modelEndpoints
    ).toEqual({
      activeEndpointId: "file-openai",
      endpoints: [
        fakeModelEndpoint("file-fake", "file-fake-model"),
        openAIModelEndpoint({
          id: "file-openai",
          providerId: "openai-compatible",
          modelId: "file-openai-model",
          baseUrl: "https://file.example.test/v1",
          secretRef: "env://FILE_API_KEY"
        })
      ]
    })
  })

  it("rejects unsafe or ambiguous model endpoint catalog startup options", () => {
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoints-json",
          JSON.stringify({
            endpoints: [
              {
                id: "catalog-openai",
                apiKey: "raw-secret"
              }
            ]
          })
        ],
        env: {}
      })
    ).toThrow("must reference credentials with connection.secretRef")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoints-json",
          JSON.stringify({ endpoints: [] }),
          "--model-endpoint-id",
          "mixed"
        ],
        env: {}
      })
    ).toThrow("model-endpoints-json cannot be combined with --model-endpoint-id")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoints-file",
          "./model-endpoints.json",
          "--model-endpoints-json",
          JSON.stringify({ endpoints: [] })
        ],
        env: {}
      })
    ).toThrow("model-endpoints-file cannot be combined with model-endpoints-json")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--model-endpoints-file", "./missing.json"],
        env: {}
      })
    ).toThrow("failed to read model endpoint catalog file")
  })

  it("requires complete non-fake model endpoint options", () => {
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoint-id", "incomplete",
          "--provider-protocol", "openai-chat-completions",
          "--provider-id", "openai-compatible",
          "--provider-model-id", "model",
          "--provider-secret-ref", "env://API_KEY"
        ],
        env: {}
      })
    ).toThrow("provider-base-url is required when configuring a model endpoint")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoint-id", "incomplete",
          "--provider-protocol", "openai-chat-completions",
          "--provider-id", "openai-compatible",
          "--provider-model-id", "model",
          "--provider-base-url",
          "https://api.example.test/v1"
        ],
        env: {}
      })
    ).toThrow("provider-secret-ref is required when configuring a model endpoint")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoint-id", "incomplete",
          "--provider-protocol", "openai-chat-completions",
          "--provider-id", "openai-compatible",
          "--provider-model-id", "model",
          "--provider-base-url",
          "https://api.example.test/v1",
          "--provider-api-key-env",
          "MISSING_API_KEY"
        ],
        env: {}
      })
    ).toThrow("unknown option: --provider-api-key-env")

    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--model-endpoint-id", "incomplete",
          "--provider-id", "custom-provider",
          "--provider-model-id", "model"
        ],
        env: {}
      })
    ).toThrow("provider-protocol is required when configuring a model endpoint")
  })

  it("resolves explicit service binary paths from cwd", () => {
    expect(
      parseLocalCliOptions({
        cwd: "/workspace/wanex/apps/assistant-host",
        artifactRoot: "/workspace/wanex",
        args: ["--service-bin", `../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`],
        env: {}
      }).serviceBin
    ).toBe(resolve(
      `/workspace/wanex/target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
    ))
  })

  it("rejects ambiguous storage options", () => {
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--store-dir", "./store", "--profile-id", "work"],
        env: {}
      })
    ).toThrow("store-dir storage cannot be combined with profile options")
  })

  it("rejects invalid values", () => {
    expect(parseLocalCliPort("0")).toBe(0)
    expect(parseLocalCliPort("65535")).toBe(65535)
    expect(() => parseLocalCliPort("65536")).toThrow(
      "invalid port: 65536"
    )
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--unknown", "value"],
        env: {}
      })
    ).toThrow("unknown option: --unknown")
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--open", "false"],
        env: {}
      })
    ).toThrow("unexpected argument: false")
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke", "false"],
        env: {}
      })
    ).toThrow("unexpected argument: false")
    expect(() =>
      parseLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--summary-format", "yaml"],
        env: {}
      })
    ).toThrow("invalid summary format: yaml")
  })

  it("creates platform browser open commands", () => {
    expect(
      createLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "darwin"
      })
    ).toEqual({
      command: "open",
      args: ["http://127.0.0.1:57015/"]
    })
    expect(
      createLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "win32"
      })
    ).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "http://127.0.0.1:57015/"]
    })
    expect(
      createLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "linux"
      })
    ).toEqual({
      command: "xdg-open",
      args: ["http://127.0.0.1:57015/"]
    })
    expect(() =>
      createLocalBrowserOpenCommand({
        url: "file:///tmp/index.html",
        platform: "darwin"
      })
    ).toThrow("unsupported browser URL protocol: file:")
  })

  it("opens the browser with a test spawn implementation", () => {
    const calls: unknown[] = []
    const result = openLocalBrowser({
      url: "http://127.0.0.1:57015",
      platform: "darwin",
      spawn(command, args, options) {
        calls.push({ command, args, options })
        const child = {
          once: () => child,
          unref: () => child
        }
        return child
      }
    })

    expect(result).toEqual({
      ok: true,
      command: {
        command: "open",
        args: ["http://127.0.0.1:57015/"]
      }
    })
    expect(calls).toEqual([
      {
        command: "open",
        args: ["http://127.0.0.1:57015/"],
        options: {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        }
      }
    ])
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function fakeModelEndpoint(id: string, modelId: string) {
  return {
    id,
    connection: { id, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `cli.${id}`,
        revision: "1"
      }
    }
  }
}

function openAIModelEndpoint(request: {
  readonly id: string
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
  readonly inputModalities?: readonly ("text" | "image")[]
}) {
  return {
    id: request.id,
    connection: {
      id: request.id,
      providerId: request.providerId,
      baseUrl: request.baseUrl,
      secretRef: request.secretRef
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: request.modelId,
      operations: ["conversation"],
      inputModalities: request.inputModalities ?? ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `cli.${request.id}`,
        revision: "1"
      }
    }
  }
}
