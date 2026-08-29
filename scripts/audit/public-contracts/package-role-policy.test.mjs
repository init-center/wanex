import { describe, expect, it } from "vitest"
import {
  findPackageRoleCoverageViolations,
  findPackageRoleDependencyViolations
} from "./package-role-policy.mjs"

describe("package role policy", () => {
  it("requires exactly known workspace package roles", () => {
    expect(
      findPackageRoleCoverageViolations(
        [{ name: "@wanex/runtime" }, { name: "@wanex/app" }],
        {
          "@wanex/runtime": "public-facade",
          "@wanex/removed": "internal"
        }
      )
    ).toEqual([
      expect.objectContaining({
        code: "missing-package-role",
        package: "@wanex/app"
      }),
      expect.objectContaining({
        code: "unknown-package-role-entry",
        package: "@wanex/removed"
      })
    ])
  })

  it("rejects production runtime dependencies on examples", () => {
    expect(
      findPackageRoleDependencyViolations(
        {
          name: "@wanex/assistant",
          dependencies: {
            "@wanex/example-fixture": "workspace:*"
          }
        },
        {
          "@wanex/assistant": "app",
          "@wanex/example-fixture": "example"
        }
      )
    ).toEqual([
      expect.objectContaining({
        code: "forbidden-production-example-dependency",
        package: "@wanex/assistant",
        dependency: "@wanex/example-fixture"
      })
    ])
  })

  it("allows examples to consume production APIs", () => {
    expect(
      findPackageRoleDependencyViolations(
        {
          name: "@wanex/example-fixture",
          dependencies: {
            "@wanex/runtime": "workspace:*"
          }
        },
        {
          "@wanex/example-fixture": "example",
          "@wanex/runtime": "public-facade"
        }
      )
    ).toEqual([])
  })

  it("allows test packages only as development dependencies", () => {
    const roles = {
      "@wanex/runtime": "public-facade",
      "@wanex/testing": "test"
    }
    expect(
      findPackageRoleDependencyViolations(
        {
          name: "@wanex/runtime",
          devDependencies: {
            "@wanex/testing": "workspace:*"
          }
        },
        roles
      )
    ).toEqual([])
    expect(
      findPackageRoleDependencyViolations(
        {
          name: "@wanex/runtime",
          dependencies: {
            "@wanex/testing": "workspace:*"
          }
        },
        roles
      )
    ).toEqual([
      expect.objectContaining({
        code: "forbidden-runtime-test-dependency"
      })
    ])
  })
})
