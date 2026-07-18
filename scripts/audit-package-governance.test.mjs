import { describe, expect, it } from "vitest"
import { findPackageDispositionViolations } from "./audit/package-governance/package-disposition-policy.mjs"
import {
  createConsumerBaseline,
  findConsumerBaselineViolations
} from "./audit/package-governance/consumer-baseline-policy.mjs"

const roles = {
  "@wanex/runtime": "public-facade",
  "@wanex/example": "example"
}

const manifests = [
  manifest("@wanex/runtime", "packages/runtime"),
  manifest("@wanex/example", "apps/example", {
    dependencies: { "@wanex/runtime": "workspace:*" }
  })
]

describe("package governance policy", () => {
  it("excludes examples and tests from real-consumer evidence", () => {
    const baseline = createConsumerBaseline(manifests, roles)
    expect(baseline.packages["@wanex/runtime"].consumers).toEqual([
      { package: "@wanex/example", field: "dependencies" }
    ])
    expect(baseline.packages["@wanex/runtime"].realConsumers).toEqual([])
  })

  it("rejects an unreviewed workspace dependency edge", () => {
    const baseline = createConsumerBaseline(
      manifests.map((entry) => entry.name === "@wanex/example"
        ? manifest("@wanex/example", "apps/example")
        : entry),
      roles
    )
    const failures = findConsumerBaselineViolations({ manifests, packageRoles: roles, baseline })
    expect(failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unreviewed-workspace-dependency-edge",
        package: "@wanex/runtime"
      })
    ]))
  })

  it("requires complete dispositions and absent tombstones", () => {
    const failures = findPackageDispositionViolations({
      manifests,
      packageRoles: roles,
      dispositionContract: {
        packages: {
          "@wanex/runtime": disposition("packages/runtime", "public-facade")
        },
        tombstones: {
          "@wanex/example": {
            ...disposition("apps/example", "example"),
            disposition: "delete"
          }
        }
      }
    })
    expect(failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "missing-package-disposition",
      "tombstoned-package-exists"
    ]))
  })
})

function manifest(name, path, fields = {}) {
  return { name, path, manifest: { name, ...fields } }
}

function disposition(path, role) {
  return {
    path,
    role,
    disposition: "retain",
    targetOwner: "@wanex/runtime",
    targetPhase: "Phase 748",
    rationale: "fixture rationale",
    evidence: "fixture evidence"
  }
}
