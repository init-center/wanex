import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createProductAppLocalBrowserOpenCommand,
  openProductAppLocalBrowser,
  parseProductAppLocalCliBoolean,
  parseProductAppLocalCliOptions,
  parseProductAppLocalCliPollIntervalMs,
  parseProductAppLocalCliPort,
  parseProductAppLocalCliSummaryFormat
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

describe("@wanex/product-app-local CLI options", () => {
  it("parses explicit store-dir startup options", () => {
    expect(
      parseProductAppLocalCliOptions({
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
          "./target/custom-system-service",
          "--poll-interval-ms",
          "0"
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
      pollIntervalMs: 0,
      serviceBin: "/repo/target/custom-system-service",
      storage: {
        kind: "store-dir",
        storeDir: "/repo/store"
      },
      providerProfiles: {
        profiles: [
          {
            id: "product-app-local-cli",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "product-app-local-cli-model"
          }
        ]
      }
    })
  })

  it("defaults to local profile storage and system-service artifact path", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/workspace/product",
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
      serviceBin: "/workspace/wanex/target/debug/wanex-system-service",
      storage: {
        kind: "profile",
        rootDir: "/workspace/product/.wanex-product-app-local",
        profileId: "default"
      },
      providerProfiles: {
        profiles: [
          {
            id: "product-app-local-cli",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "product-app-local-cli-model"
          }
        ]
      }
    })
  })

  it("parses profile storage from environment", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_HOSTNAME: "127.0.0.2",
          WANEX_PRODUCT_APP_LOCAL_PORT: "57016",
          WANEX_PRODUCT_APP_LOCAL_PROFILE_ROOT: "./profiles",
          WANEX_PRODUCT_APP_LOCAL_PROFILE_ID: "work",
          WANEX_SYSTEM_SERVICE_BIN: "./target/env-system-service",
          WANEX_PRODUCT_APP_LOCAL_POLL_INTERVAL_MS: "1500",
          WANEX_PRODUCT_APP_LOCAL_OPEN: "yes",
          WANEX_PRODUCT_APP_LOCAL_SMOKE: "true",
          WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT: "json",
          WANEX_PROVIDER_PROFILE_ID: "fallback-profile",
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
      pollIntervalMs: 1500,
      serviceBin: "/repo/target/env-system-service",
      storage: {
        kind: "profile",
        rootDir: "/repo/profiles",
        profileId: "work"
      },
      providerProfiles: {
        profiles: [
          {
            id: "fallback-profile",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "fallback-model"
          }
        ]
      }
    })
  })

  it("parses product-local provider profile flags over environment fallbacks", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-profile-id",
          "flag-profile",
          "--provider-kind",
          "openai-compatible",
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
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILE_ID: "env-profile",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_KIND: "fake",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_ID: "env-provider",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_MODEL_ID: "env-model",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_BASE_URL: "https://env.example.test/v1",
          TEST_PROVIDER_API_KEY: "secret-from-env"
        }
      }).providerProfiles
    ).toEqual({
      profiles: [
        {
          id: "flag-profile",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "flag-provider",
          modelId: "flag-model",
          baseUrl: "https://api.example.test/v1",
          secretRef: "env://TEST_PROVIDER_API_KEY"
        }
      ]
    })
  })

  it("parses explicit browser open options", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--open"],
        env: {}
      }).open
    ).toBe(true)
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_OPEN: "0"
        }
      }).open
    ).toBe(false)
    expect(parseProductAppLocalCliBoolean("on", "TEST_BOOL")).toBe(true)
    expect(parseProductAppLocalCliBoolean("off", "TEST_BOOL")).toBe(false)
    expect(() => parseProductAppLocalCliBoolean("maybe", "TEST_BOOL"))
      .toThrow("invalid boolean for TEST_BOOL: maybe")
  })

  it("parses explicit smoke options", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke"],
        env: {}
      }).smoke
    ).toBe(true)
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_SMOKE: "0"
        }
      }).smoke
    ).toBe(false)
  })

  it("parses explicit provider setup options", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--setup-provider"],
        env: {}
      }).setupProvider
    ).toBe(true)
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_SETUP_PROVIDER: "0"
        }
      }).setupProvider
    ).toBe(false)
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke", "--setup-provider"],
        env: {}
      })
    ).toThrow("setup-provider cannot be combined with smoke")
  })

  it("parses startup summary format options", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--summary-format", "json"],
        env: {}
      }).summaryFormat
    ).toBe("json")
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT: "text"
        }
      }).summaryFormat
    ).toBe("text")
    expect(parseProductAppLocalCliSummaryFormat("JSON")).toBe("json")
    expect(parseProductAppLocalCliSummaryFormat(" text ")).toBe("text")
    expect(() => parseProductAppLocalCliSummaryFormat("yaml"))
      .toThrow("invalid summary format: yaml")
  })

  it("parses product-local provider profile environment over generic fallbacks", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [],
        env: {
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILE_ID: "local-env-profile",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_KIND: "openai-compatible",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_ID: "local-env-provider",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_MODEL_ID: "local-env-model",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_INPUT_MODALITIES: "text,image",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_OUTPUT_MODALITIES: "text",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_BASE_URL: "https://local.example.test/v1",
          WANEX_PRODUCT_APP_LOCAL_PROVIDER_SECRET_REF: "env://LOCAL_API_KEY",
          WANEX_PROVIDER_PROFILE_ID: "generic-env-profile",
          WANEX_PROVIDER_KIND: "fake",
          WANEX_PROVIDER_ID: "generic-env-provider",
          WANEX_PROVIDER_MODEL_ID: "generic-env-model"
        }
      }).providerProfiles
    ).toEqual({
      profiles: [
        {
          id: "local-env-profile",
          kind: "openai-compatible",
          capabilities: { input: ["text", "image"], output: ["text"] },
          providerId: "local-env-provider",
          modelId: "local-env-model",
          baseUrl: "https://local.example.test/v1",
          secretRef: "env://LOCAL_API_KEY"
        }
      ]
    })
  })

  it("parses trusted provider profile catalog JSON with secret refs", () => {
    const catalog = JSON.stringify({
      profiles: [
        {
          id: "catalog-fake",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          modelId: "catalog-fake-model"
        },
        {
          id: "catalog-openai",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "catalog-openai-model",
          baseUrl: "https://catalog.example.test/v1",
          secretRef: "env://CATALOG_API_KEY"
        }
      ],
      activeProfileId: "catalog-openai"
    })

    expect(
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--provider-profiles-json", catalog],
        env: {}
      }).providerProfiles
    ).toEqual({
      activeProfileId: "catalog-openai",
      profiles: [
        {
          id: "catalog-fake",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "catalog-fake-model"
        },
        {
          id: "catalog-openai",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "catalog-openai-model",
          baseUrl: "https://catalog.example.test/v1",
          secretRef: "env://CATALOG_API_KEY"
        }
      ]
    })
  })

  it("parses trusted provider profile catalog files with secret refs", async () => {
    const dir = await tempDir("wanex-product-app-local-provider-catalog-")
    const catalogPath = join(dir, "providers.json")
    await writeFile(
      catalogPath,
      JSON.stringify({
        profiles: [
          {
            id: "file-fake",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            modelId: "file-fake-model"
          },
          {
            id: "file-openai",
            kind: "openai-compatible",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "openai-compatible",
            modelId: "file-openai-model",
            baseUrl: "https://file.example.test/v1",
            secretRef: "env://FILE_API_KEY"
          }
        ],
        activeProfileId: "file-fake"
      }),
      "utf8"
    )

    expect(
      parseProductAppLocalCliOptions({
        cwd: dir,
        artifactRoot: "/repo",
        args: [
          "--provider-profiles-file",
          "./providers.json",
          "--active-provider-profile-id",
          "file-openai"
        ],
        env: {}
      }).providerProfiles
    ).toEqual({
      activeProfileId: "file-openai",
      profiles: [
        {
          id: "file-fake",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "file-fake-model"
        },
        {
          id: "file-openai",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "file-openai-model",
          baseUrl: "https://file.example.test/v1",
          secretRef: "env://FILE_API_KEY"
        }
      ]
    })
  })

  it("rejects unsafe or ambiguous provider profile catalog startup options", () => {
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-profiles-json",
          JSON.stringify({
            profiles: [
              {
                id: "catalog-openai",
                apiKey: "raw-secret"
              }
            ]
          })
        ],
        env: {}
      })
    ).toThrow("must use secretRef")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-profiles-json",
          JSON.stringify({ profiles: [] }),
          "--provider-profile-id",
          "mixed"
        ],
        env: {}
      })
    ).toThrow("provider-profiles-json cannot be combined with --provider-profile-id")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-profiles-file",
          "./providers.json",
          "--provider-profiles-json",
          JSON.stringify({ profiles: [] })
        ],
        env: {}
      })
    ).toThrow("provider-profiles-file cannot be combined with provider-profiles-json")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--provider-profiles-file", "./missing.json"],
        env: {}
      })
    ).toThrow("failed to read provider profile catalog file")
  })

  it("rejects incomplete openai-compatible provider startup options", () => {
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--provider-kind", "openai-compatible"],
        env: {}
      })
    ).toThrow("openai-compatible provider requires provider-base-url")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-kind",
          "openai-compatible",
          "--provider-base-url",
          "https://api.example.test/v1"
        ],
        env: {}
      })
    ).toThrow("openai-compatible provider requires provider-secret-ref")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: [
          "--provider-kind",
          "openai-compatible",
          "--provider-base-url",
          "https://api.example.test/v1",
          "--provider-api-key-env",
          "MISSING_API_KEY"
        ],
        env: {}
      })
    ).toThrow("unknown option: --provider-api-key-env")

    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--provider-kind", "other"],
        env: {}
      })
    ).toThrow("invalid provider kind: other")
  })

  it("resolves explicit service binary paths from cwd", () => {
    expect(
      parseProductAppLocalCliOptions({
        cwd: "/workspace/wanex/apps/product-app-local",
        artifactRoot: "/workspace/wanex",
        args: ["--service-bin", "../../target/debug/wanex-system-service"],
        env: {}
      }).serviceBin
    ).toBe("/workspace/wanex/target/debug/wanex-system-service")
  })

  it("rejects ambiguous storage options", () => {
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--store-dir", "./store", "--profile-id", "work"],
        env: {}
      })
    ).toThrow("store-dir storage cannot be combined with profile options")
  })

  it("rejects invalid values", () => {
    expect(parseProductAppLocalCliPort("0")).toBe(0)
    expect(parseProductAppLocalCliPort("65535")).toBe(65535)
    expect(() => parseProductAppLocalCliPort("65536")).toThrow(
      "invalid port: 65536"
    )
    expect(parseProductAppLocalCliPollIntervalMs("0")).toBe(0)
    expect(parseProductAppLocalCliPollIntervalMs("60000")).toBe(60_000)
    expect(() => parseProductAppLocalCliPollIntervalMs("60001")).toThrow(
      "invalid poll interval: 60001"
    )
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--unknown", "value"],
        env: {}
      })
    ).toThrow("unknown option: --unknown")
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--open", "false"],
        env: {}
      })
    ).toThrow("unexpected argument: false")
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--smoke", "false"],
        env: {}
      })
    ).toThrow("unexpected argument: false")
    expect(() =>
      parseProductAppLocalCliOptions({
        cwd: "/repo",
        artifactRoot: "/repo",
        args: ["--summary-format", "yaml"],
        env: {}
      })
    ).toThrow("invalid summary format: yaml")
  })

  it("creates platform browser open commands", () => {
    expect(
      createProductAppLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "darwin"
      })
    ).toEqual({
      command: "open",
      args: ["http://127.0.0.1:57015/"]
    })
    expect(
      createProductAppLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "win32"
      })
    ).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "http://127.0.0.1:57015/"]
    })
    expect(
      createProductAppLocalBrowserOpenCommand({
        url: "http://127.0.0.1:57015",
        platform: "linux"
      })
    ).toEqual({
      command: "xdg-open",
      args: ["http://127.0.0.1:57015/"]
    })
    expect(() =>
      createProductAppLocalBrowserOpenCommand({
        url: "file:///tmp/index.html",
        platform: "darwin"
      })
    ).toThrow("unsupported browser URL protocol: file:")
  })

  it("opens the browser with a test spawn implementation", () => {
    const calls: unknown[] = []
    const result = openProductAppLocalBrowser({
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
