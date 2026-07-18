import { describe, expect, it } from "vitest"
import {
  ConnectorSdkUnavailableError,
  loadOptionalConnectorSdk,
  requireConnectorSdk,
  validateConnectorSdkSpec,
  validateConnectorSdkSpecLike,
  type ConnectorSdkLoaderSpec
} from "../src/index.js"

describe("@wanex/connector sdk loader", () => {
  it("loads an optional connector SDK lazily through an injected importer", async () => {
    await expect(
      loadOptionalConnectorSdk({
        spec: sdkSpec(),
        importer: () => ({ name: "sdk" })
      })
    ).resolves.toMatchObject({
      status: "loaded",
      sdk: { name: "sdk" }
    })
  })

  it("reports missing optional SDKs without throwing", async () => {
    const error = new Error("Cannot find package 'grammy'") as Error & {
      code: string
    }
    error.code = "ERR_MODULE_NOT_FOUND"
    const result = await loadOptionalConnectorSdk({
      spec: sdkSpec(),
      importer: () => {
        throw error
      }
    })

    expect(result).toMatchObject({
      status: "missing",
      error: {
        code: "connector_sdk.missing",
        packageName: "grammy"
      }
    })
    expect(JSON.stringify(result)).not.toContain("stack")
  })

  it("throws a safe ConnectorSdkUnavailableError when the SDK is required", async () => {
    await expect(
      requireConnectorSdk({
        spec: sdkSpec(),
        importer: () => {
          throw new Error("bad sdk side effect")
        }
      })
    ).rejects.toMatchObject({
      name: "ConnectorSdkUnavailableError",
      code: "connector_sdk.load_failed",
      packageName: "grammy"
    } satisfies Partial<ConnectorSdkUnavailableError>)
  })

  it("rejects eager SDK loader specs", () => {
    expect(() =>
      validateConnectorSdkSpecLike({
        ...sdkSpec(),
        loading: "startup"
      })
    ).toThrow(/loading must be lazy/)
  })
})

function sdkSpec(): ConnectorSdkLoaderSpec {
  return {
    packageName: "grammy",
    distribution: "optional",
    loading: "lazy",
    adapterId: "telegram-spike"
  }
}
