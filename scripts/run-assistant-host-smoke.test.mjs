import { describe, expect, it } from "vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createAssistantHostSmokeRun
} from "./run-assistant-host-smoke.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/assistant-host")

describe("run-assistant-host-smoke", () => {
  it("runs Assistant Host smoke through a temporary profile root", async () => {
    const smoke = await createAssistantHostSmokeRun({
      forwardedArgs: [],
      createTempRoot: async () => "/tmp/wanex-assistant-host-smoke-test"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-assistant-host-smoke-test")
    expect(smoke.step).toEqual({
      name: "Assistant Host smoke",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/cli/main.ts",
        "--profile-root",
        "/tmp/wanex-assistant-host-smoke-test",
        "--profile-id",
        "smoke",
        "--summary-format",
        "json",
        "--smoke",
        "--model-endpoint-id",
        "assistant-host-smoke",
        "--provider-protocol",
        "fake",
        "--provider-id",
        "fake",
        "--provider-model-id",
        "assistant-host-smoke-model",
        "--active-model-endpoint-id",
        "assistant-host-smoke"
      ]
    })
  })

  it("lets explicit storage arguments replace the temporary profile default", async () => {
    const smoke = await createAssistantHostSmokeRun({
      forwardedArgs: ["--", "--store-dir", "/tmp/wanex-store", "--port", "0"],
      createTempRoot: async () => {
        throw new Error("unexpected temp root")
      }
    })

    expect(smoke.cleanupDir).toBeUndefined()
    expect(smoke.step.args).not.toContain("--profile-root")
    expect(smoke.step.args).not.toContain("--profile-id")
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      "--summary-format",
      "json",
      "--smoke",
      "--model-endpoint-id",
      "assistant-host-smoke",
      "--provider-protocol",
      "fake",
      "--provider-id",
      "fake",
      "--provider-model-id",
      "assistant-host-smoke-model",
      "--active-model-endpoint-id",
      "assistant-host-smoke",
      "--store-dir",
      "/tmp/wanex-store",
      "--port",
      "0"
    ])
  })

  it("runs Assistant Host provider setup when requested", async () => {
    const setup = await createAssistantHostSmokeRun({
      forwardedArgs: [
        "--setup-provider",
        "--model-endpoint-id",
        "setup-openai",
        "--provider-protocol",
        "openai-chat-completions",
        "--provider-id",
        "openai-compatible",
        "--provider-model-id",
        "setup-model",
        "--provider-base-url",
        "https://provider.example.test/v1",
        "--provider-secret-ref",
        "env://SETUP_API_KEY",
        "--active-model-endpoint-id",
        "setup-openai"
      ],
      createTempRoot: async () => "/tmp/wanex-assistant-host-setup-test"
    })

    expect(setup.cleanupDir).toBe("/tmp/wanex-assistant-host-setup-test")
    expect(setup.step).toEqual({
      name: "Assistant Host provider setup",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/cli/main.ts",
        "--profile-root",
        "/tmp/wanex-assistant-host-setup-test",
        "--profile-id",
        "smoke",
        "--summary-format",
        "json",
        "--setup-provider",
        "--model-endpoint-id",
        "setup-openai",
        "--provider-protocol",
        "openai-chat-completions",
        "--provider-id",
        "openai-compatible",
        "--provider-model-id",
        "setup-model",
        "--provider-base-url",
        "https://provider.example.test/v1",
        "--provider-secret-ref",
        "env://SETUP_API_KEY",
        "--active-model-endpoint-id",
        "setup-openai"
      ]
    })
  })

  it("rejects conflicting Assistant Host one-shot modes", async () => {
    await expect(createAssistantHostSmokeRun({
      forwardedArgs: ["--smoke", "--setup-provider"],
      createTempRoot: async () => "/tmp/wanex-assistant-host-conflict"
    })).rejects.toThrow(
      "Assistant Host one-shot runner cannot combine smoke and setup-provider"
    )
  })

  it("lets forwarded profile and output flags override defaults", async () => {
    const smoke = await createAssistantHostSmokeRun({
      forwardedArgs: [
        "--profile-root",
        "/tmp/custom-root",
        "--profile-id",
        "custom",
        "--summary-format",
        "text"
      ],
      createTempRoot: async () => {
        throw new Error("unexpected temp root")
      }
    })

    expect(smoke.cleanupDir).toBeUndefined()
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      "--summary-format",
      "json",
      "--smoke",
      "--model-endpoint-id",
      "assistant-host-smoke",
      "--provider-protocol",
      "fake",
      "--provider-id",
      "fake",
      "--provider-model-id",
      "assistant-host-smoke-model",
      "--active-model-endpoint-id",
      "assistant-host-smoke",
      "--profile-root",
      "/tmp/custom-root",
      "--profile-id",
      "custom",
      "--summary-format",
      "text"
    ])
  })

  it("forwards trusted provider catalog startup flags to the package CLI", async () => {
    const catalog = JSON.stringify({
      endpoints: [
        {
          id: "smoke-fake",
          connection: { id: "smoke-fake", providerId: "fake" },
          protocol: { id: "fake" },
          model: {
            id: "smoke-fake-model",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: [],
            catalog: {
              source: "builtin",
              catalogId: "wanex.smoke.fake",
              revision: "1"
            }
          }
        },
        {
          id: "smoke-openai",
          connection: {
            id: "smoke-openai",
            providerId: "openai-compatible",
            baseUrl: "https://smoke.example.test/v1",
            secretRef: "env://SMOKE_API_KEY"
          },
          protocol: { id: "openai-chat-completions" },
          model: {
            id: "smoke-openai-model",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: [],
            catalog: {
              source: "custom",
              catalogId: "wanex.smoke.openai",
              revision: "1"
            }
          }
        }
      ],
      activeEndpointId: "smoke-fake"
    })
    const smoke = await createAssistantHostSmokeRun({
      forwardedArgs: [
        "--model-endpoints-json",
        catalog,
        "--active-model-endpoint-id",
        "smoke-fake"
      ],
      createTempRoot: async () => "/tmp/wanex-assistant-host-smoke-catalog"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-assistant-host-smoke-catalog")
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      "--profile-root",
      "/tmp/wanex-assistant-host-smoke-catalog",
      "--profile-id",
      "smoke",
      "--summary-format",
      "json",
      "--smoke",
      "--model-endpoints-json",
      catalog,
      "--active-model-endpoint-id",
      "smoke-fake"
    ])
  })

  it("forwards trusted provider catalog file startup flags to the package CLI", async () => {
    const smoke = await createAssistantHostSmokeRun({
      forwardedArgs: [
        "--model-endpoints-file",
        "/tmp/providers.json",
        "--active-model-endpoint-id",
        "smoke-file"
      ],
      createTempRoot: async () => "/tmp/wanex-assistant-host-smoke-file"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-assistant-host-smoke-file")
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      "--profile-root",
      "/tmp/wanex-assistant-host-smoke-file",
      "--profile-id",
      "smoke",
      "--summary-format",
      "json",
      "--smoke",
      "--model-endpoints-file",
      "/tmp/providers.json",
      "--active-model-endpoint-id",
      "smoke-file"
    ])
  })
})
