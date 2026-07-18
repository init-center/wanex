import { describe, expect, it } from "vitest"
import {
  assertConnectorAdapterPackaging,
  validateConnectorAdapterPackaging,
  type ConnectorAdapterPackageJsonLike,
  type ConnectorAdapterPackagingSpec
} from "../src/index.js"

describe("@wanex/connector connector packaging", () => {
  it("accepts a lightweight connector adapter package contract", () => {
    const report = assertConnectorAdapterPackaging({
      packageJson: validPackageJson(),
      packaging: validPackaging(),
      manifest: {
        pluginId: "plugin.connector.example",
        version: "1.0.0"
      }
    })

    expect(report).toMatchObject({
      ok: true,
      errors: []
    })
  })

  it("rejects gateway and host node_modules bundle requirements", () => {
    const report = validateConnectorAdapterPackaging({
      packageJson: validPackageJson(),
      packaging: {
        ...validPackaging(),
        bundleMode: "host-app-node-modules",
        requiresGateway: true
      }
    })

    expect(report.ok).toBe(false)
    expect(report.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "connector_packaging.gateway_required",
        "connector_packaging.host_node_modules_bundle"
      ])
    )
  })

  it("rejects app/runtime host packages in runtime dependencies", () => {
    const report = validateConnectorAdapterPackaging({
      packageJson: {
        ...validPackageJson(),
        dependencies: {
          "@wanex/connector": "workspace:*",
          "@wanex/protocol": "workspace:*",
          "@wanex/runtime": "workspace:*",
          electron: "latest"
        }
      },
      packaging: validPackaging()
    })

    expect(report.ok).toBe(false)
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "connector_packaging.forbidden_runtime_dependency",
          dependency: "@wanex/runtime"
        }),
        expect.objectContaining({
          code: "connector_packaging.forbidden_runtime_dependency",
          dependency: "electron"
        })
      ])
    )
  })

  it("requires bundled SDK dependencies to be lazy and budgeted", () => {
    const report = validateConnectorAdapterPackaging({
      packageJson: validPackageJson(),
      packaging: {
        ...validPackaging(),
        sdkDependencies: [
          {
            name: "heavy-channel-sdk",
            distribution: "bundled",
            loading: "startup"
          }
        ]
      }
    })

    expect(report.ok).toBe(false)
    expect(report.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["connector_packaging.sdk_dependency_invalid"])
    )
  })
})

function validPackageJson(): ConnectorAdapterPackageJsonLike {
  return {
    name: "@wanex/connector-adapter-example",
    version: "1.0.0",
    type: "module",
    exports: {
      ".": "./dist/index.js"
    },
    dependencies: {
      "@wanex/connector": "workspace:*",
      "@wanex/protocol": "workspace:*"
    }
  }
}

function validPackaging(): ConnectorAdapterPackagingSpec {
  return {
    kind: "wanex.connector-adapter.package",
    pluginId: "plugin.connector.example",
    packageName: "@wanex/connector-adapter-example",
    adapterExport: "createExampleConnectorAdapter",
    bundleMode: "adapter-with-declared-runtime-deps",
    requiresGateway: false,
    runtimeDependencies: [
      "@wanex/connector",
      "@wanex/protocol"
    ],
    sdkDependencies: [
      {
        name: "example-channel-sdk",
        distribution: "optional",
        loading: "lazy"
      }
    ]
  }
}
