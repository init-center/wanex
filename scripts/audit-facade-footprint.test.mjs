import { describe, expect, it } from "vitest"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { evaluateFacadeFootprint, refreshFacadeMeasurements } from "./audit/facade-footprint/facade-footprint-policy.mjs"

const baseline = {
  esbuildVersion: "1.0.0",
  buildOptions: { target: "node24", minify: false },
  forbiddenWorkspacePackages: ["@wanex/plugin"],
  facades: {
    runtime: {
      outputBytes: 100,
      inputCount: 2,
      allowedWorkspacePackages: ["@wanex/runtime"]
    }
  }
}

describe("facade footprint policy", () => {
  it.each(["runtime", "app"])("keeps optional media implementations out of the %s facade", async (name) => {
    const result = await build({
      absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
      entryPoints: [`packages/${name}/src/index.ts`],
      bundle: true, platform: "node", format: "esm", target: "node24",
      metafile: true, write: false, logLevel: "silent"
    })
    const inputs = Object.keys(result.metafile.inputs)
    expect(inputs).toContain("packages/protocol/src/model-descriptor.ts")
    expect(inputs).not.toContain("packages/runtime/src/media-generation/runtime.ts")
    expect(inputs.filter((path) => /media-generation\/(?:capability|openai-images|gemini-image|openrouter-images|volcengine-seedream|option-catalog)\.ts$/.test(path))).toEqual([])
  })

  it("accepts a shrinking reviewed closure", () => {
    expect(evaluateFacadeFootprint({
      baseline,
      report: report({ outputBytes: 80, inputCount: 1, workspacePackages: ["@wanex/runtime"] })
    })).toMatchObject({ failures: [], comparison: { comparable: true,
      changes: { runtime: { outputBytesDelta: -20, inputCountDelta: -1 } } } })
  })

  it("reports byte and input growth without blocking ordinary implementation changes", () => {
    expect(evaluateFacadeFootprint({ baseline,
      report: report({ outputBytes: 101, inputCount: 3, workspacePackages: ["@wanex/runtime"] })
    })).toMatchObject({ failures: [], comparison: { comparable: true,
      changes: { runtime: { outputBytesDelta: 1, inputCountDelta: 1 } } } })
  })

  it("rejects unreviewed packages and optional capabilities regardless of size", () => {
    const { failures } = evaluateFacadeFootprint({
      baseline,
      report: report({
        outputBytes: 1,
        inputCount: 1,
        workspacePackages: ["@wanex/runtime", "@wanex/plugin"]
      })
    })
    expect(failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "unreviewed-facade-workspace-package",
      "forbidden-facade-workspace-package"
    ]))
  })

  it("still rejects a forbidden package if someone adds it to the allowed list", () => {
    const input = { baseline: { ...baseline, facades: { runtime: {
      ...baseline.facades.runtime, allowedWorkspacePackages: ["@wanex/runtime", "@wanex/plugin"]
    } } }, report: report({ outputBytes: 1, inputCount: 1, workspacePackages: ["@wanex/plugin"] }) }
    expect(evaluateFacadeFootprint(input).failures.map(f => f.code)).toEqual(["forbidden-facade-workspace-package"])
    expect(() => refreshFacadeMeasurements(input)).toThrow("boundary violations")
  })

  it("marks tool-version changes incomparable while keeping dependency checks", () => {
    const evaluation = evaluateFacadeFootprint({ baseline, report: {
      ...report({ outputBytes: 500, inputCount: 5, workspacePackages: ["@wanex/plugin"] }),
      esbuildVersion: "2.0.0"
    } })
    expect(evaluation.comparison).toEqual({ comparable: false,
      changes: { runtime: { outputBytesDelta: null, inputCountDelta: null } } })
    expect(evaluation.notices).toMatchObject([{ code: "facade-footprint-tool-version-drift" }])
    expect(evaluation.failures.map(f => f.code)).toContain("forbidden-facade-workspace-package")
  })

  it("rejects a missing facade and refuses to refresh its baseline", () => {
    const input = { baseline, report: { ...report({}), facades: {} } }
    expect(evaluateFacadeFootprint(input).failures).toMatchObject([{ code: "missing-facade-footprint" }])
    expect(() => refreshFacadeMeasurements(input)).toThrow("missing-facade-footprint")
  })

  it("compares build parameters structurally and marks changes incomparable", () => {
    const current = report({ outputBytes: 101, inputCount: 3, workspacePackages: ["@wanex/runtime"] })
    expect(evaluateFacadeFootprint({ baseline, report: {
      ...current, buildOptions: { minify: false, target: "node24" }
    } }).comparison.comparable).toBe(true)
    const changed = evaluateFacadeFootprint({ baseline, report: {
      ...current, buildOptions: { ...current.buildOptions, minify: true }
    } })
    expect(changed.failures).toEqual([])
    expect(changed.comparison.comparable).toBe(false)
    expect(changed.comparison.changes.runtime.outputBytesDelta).toBeNull()
    expect(changed.notices).toMatchObject([{ code: "facade-footprint-build-options-drift" }])
  })

  it("refreshes measurements without changing or silently authorizing dependencies", () => {
    const input = { baseline, report: report({ outputBytes: 101, inputCount: 3,
      workspacePackages: ["@wanex/runtime"] }) }
    expect(refreshFacadeMeasurements(input)).toEqual({ ...baseline, facades: { runtime: {
      ...baseline.facades.runtime, outputBytes: 101, inputCount: 3
    } } })
    expect(baseline.facades.runtime.outputBytes).toBe(100)
    expect(() => refreshFacadeMeasurements({ ...input, report: report({
      outputBytes: 101, inputCount: 3, workspacePackages: ["@wanex/runtime", "@wanex/unknown"]
    }) })).toThrow("unreviewed-facade-workspace-package")
  })
})

function report(runtime) {
  return { esbuildVersion: "1.0.0", buildOptions: baseline.buildOptions, facades: { runtime } }
}
