import { describe, expect, it } from "vitest"
import {
  createProductAppLocalSmokeRun
} from "./run-product-app-local-smoke.mjs"

describe("run-product-app-local-smoke", () => {
  it("runs Product App Local smoke through a temporary profile root", async () => {
    const smoke = await createProductAppLocalSmokeRun({
      forwardedArgs: [],
      createTempRoot: async () => "/tmp/wanex-product-app-local-smoke-test"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-product-app-local-smoke-test")
    expect(smoke.step).toEqual({
      name: "Product App Local smoke",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        expect.stringContaining("apps/product-app-local"),
        "exec",
        "tsx",
        "./src/main.ts",
        "--profile-root",
        "/tmp/wanex-product-app-local-smoke-test",
        "--profile-id",
        "smoke",
        "--poll-interval-ms",
        "0",
        "--summary-format",
        "json",
        "--smoke"
      ]
    })
  })

  it("lets explicit storage arguments replace the temporary profile default", async () => {
    const smoke = await createProductAppLocalSmokeRun({
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
      expect.stringContaining("apps/product-app-local"),
      "exec",
      "tsx",
      "./src/main.ts",
      "--poll-interval-ms",
      "0",
      "--summary-format",
      "json",
      "--smoke",
      "--store-dir",
      "/tmp/wanex-store",
      "--port",
      "0"
    ])
  })

  it("runs Product App Local provider setup when requested", async () => {
    const setup = await createProductAppLocalSmokeRun({
      forwardedArgs: [
        "--setup-provider",
        "--provider-profile-id",
        "setup-openai",
        "--provider-kind",
        "openai-compatible",
        "--provider-id",
        "openai-compatible",
        "--provider-model-id",
        "setup-model",
        "--provider-base-url",
        "https://provider.example.test/v1",
        "--provider-api-key-env",
        "SETUP_API_KEY",
        "--active-provider-profile-id",
        "setup-openai"
      ],
      createTempRoot: async () => "/tmp/wanex-product-app-local-setup-test"
    })

    expect(setup.cleanupDir).toBe("/tmp/wanex-product-app-local-setup-test")
    expect(setup.step).toEqual({
      name: "Product App Local provider setup",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        expect.stringContaining("apps/product-app-local"),
        "exec",
        "tsx",
        "./src/main.ts",
        "--profile-root",
        "/tmp/wanex-product-app-local-setup-test",
        "--profile-id",
        "smoke",
        "--poll-interval-ms",
        "0",
        "--summary-format",
        "json",
        "--setup-provider",
        "--provider-profile-id",
        "setup-openai",
        "--provider-kind",
        "openai-compatible",
        "--provider-id",
        "openai-compatible",
        "--provider-model-id",
        "setup-model",
        "--provider-base-url",
        "https://provider.example.test/v1",
        "--provider-api-key-env",
        "SETUP_API_KEY",
        "--active-provider-profile-id",
        "setup-openai"
      ]
    })
  })

  it("rejects conflicting Product App Local one-shot modes", async () => {
    await expect(createProductAppLocalSmokeRun({
      forwardedArgs: ["--smoke", "--setup-provider"],
      createTempRoot: async () => "/tmp/wanex-product-app-local-conflict"
    })).rejects.toThrow(
      "Product App Local one-shot runner cannot combine smoke and setup-provider"
    )
  })

  it("lets forwarded profile and output flags override defaults", async () => {
    const smoke = await createProductAppLocalSmokeRun({
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
      expect.stringContaining("apps/product-app-local"),
      "exec",
      "tsx",
      "./src/main.ts",
      "--poll-interval-ms",
      "0",
      "--summary-format",
      "json",
      "--smoke",
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
      profiles: [
        {
          id: "smoke-fake",
          kind: "fake",
          modelId: "smoke-fake-model"
        },
        {
          id: "smoke-openai",
          kind: "openai-compatible",
          providerId: "openai-compatible",
          modelId: "smoke-openai-model",
          baseUrl: "https://smoke.example.test/v1",
          apiKeyEnv: "SMOKE_API_KEY"
        }
      ],
      activeProfileId: "smoke-fake"
    })
    const smoke = await createProductAppLocalSmokeRun({
      forwardedArgs: [
        "--provider-profiles-json",
        catalog,
        "--active-provider-profile-id",
        "smoke-fake"
      ],
      createTempRoot: async () => "/tmp/wanex-product-app-local-smoke-catalog"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-product-app-local-smoke-catalog")
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      expect.stringContaining("apps/product-app-local"),
      "exec",
      "tsx",
      "./src/main.ts",
      "--profile-root",
      "/tmp/wanex-product-app-local-smoke-catalog",
      "--profile-id",
      "smoke",
      "--poll-interval-ms",
      "0",
      "--summary-format",
      "json",
      "--smoke",
      "--provider-profiles-json",
      catalog,
      "--active-provider-profile-id",
      "smoke-fake"
    ])
  })

  it("forwards trusted provider catalog file startup flags to the package CLI", async () => {
    const smoke = await createProductAppLocalSmokeRun({
      forwardedArgs: [
        "--provider-profiles-file",
        "/tmp/providers.json",
        "--active-provider-profile-id",
        "smoke-file"
      ],
      createTempRoot: async () => "/tmp/wanex-product-app-local-smoke-file"
    })

    expect(smoke.cleanupDir).toBe("/tmp/wanex-product-app-local-smoke-file")
    expect(smoke.step.args).toEqual([
      "--silent",
      "--dir",
      expect.stringContaining("apps/product-app-local"),
      "exec",
      "tsx",
      "./src/main.ts",
      "--profile-root",
      "/tmp/wanex-product-app-local-smoke-file",
      "--profile-id",
      "smoke",
      "--poll-interval-ms",
      "0",
      "--summary-format",
      "json",
      "--smoke",
      "--provider-profiles-file",
      "/tmp/providers.json",
      "--active-provider-profile-id",
      "smoke-file"
    ])
  })
})
