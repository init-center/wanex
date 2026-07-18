import { describe, expect, it } from "vitest"
import { findFacadeFootprintViolations } from "./audit/facade-footprint/facade-footprint-policy.mjs"

const baseline = {
  esbuildVersion: "1.0.0",
  forbiddenWorkspacePackages: ["@wanex/plugin"],
  facades: {
    runtime: {
      maxOutputBytes: 100,
      maxInputCount: 2,
      allowedWorkspacePackages: ["@wanex/runtime"]
    }
  }
}

describe("facade footprint policy", () => {
  it("accepts a shrinking reviewed closure", () => {
    expect(findFacadeFootprintViolations({
      baseline,
      report: report({ outputBytes: 80, inputCount: 1, workspacePackages: ["@wanex/runtime"] })
    })).toEqual([])
  })

  it("rejects byte, input, package, and optional-capability growth", () => {
    const failures = findFacadeFootprintViolations({
      baseline,
      report: report({
        outputBytes: 101,
        inputCount: 3,
        workspacePackages: ["@wanex/runtime", "@wanex/plugin"]
      })
    })
    expect(failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "facade-output-byte-growth",
      "facade-static-input-growth",
      "unreviewed-facade-workspace-package",
      "forbidden-facade-workspace-package"
    ]))
  })
})

function report(runtime) {
  return { esbuildVersion: "1.0.0", facades: { runtime } }
}
