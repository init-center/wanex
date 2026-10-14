import { beforeEach, describe, expect, it, vi } from "vitest"
import { createVerifySteps, parseVerifyArgs, runVerify } from "./verify.mjs"
import { runProcessStep } from "./process-step.mjs"

vi.mock("./process-step.mjs", () => ({ runProcessStep: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

describe("verify", () => {
  it("defaults to the full gate and accepts only explicit suite selection", () => {
    expect(parseVerifyArgs([])).toBe("all")
    for (const suite of ["source", "artifacts", "all"]) {
      expect(parseVerifyArgs(["--suite", suite])).toBe(suite)
    }
    for (const args of [["--profile", "cool"], ["--unknown"], ["--suite"], ["--suite", "source", "--skip"]]) {
      expect(() => parseVerifyArgs(args)).toThrow("invalid verify arguments")
    }
    expect(() => parseVerifyArgs(["--suite", "fast"])).toThrow("unknown verify suite")
    expect(() => createVerifySteps("fast")).toThrow("unknown verify suite")
  })

  it("retains every source and artifact step once in the default complete gate", () => {
    const source = createVerifySteps("source")
    const artifacts = createVerifySteps("artifacts")
    const full = createVerifySteps()
    expect(full).toEqual([...source, ...artifacts])
    expect(new Set(full.map((step) => step.name)).size).toBe(full.length)
    expect(artifacts.map((step) => step.name)).toEqual([
      "Desktop packaged Server workspace acceptance",
      "Compiled SDK release proof",
      "Packed SDK runtime consumer proofs",
      "Installed TUI proof",
      "Compiled SDK determinism audit"
    ])
    expect(source.some((step) => step.name === "Rust tests")).toBe(true)
    expect(source.some((step) => step.name === "Eval harness CLI smoke")).toBe(true)
    expect(full.flatMap((step) => step.args)).not.toContain("proof:desktop")
  })

  it("stops before artifact execution if a source gate fails", async () => {
    vi.mocked(runProcessStep).mockRejectedValueOnce(new Error("source failed"))
    await expect(runVerify()).rejects.toThrow("source failed")
    expect(runProcessStep).toHaveBeenCalledTimes(1)
  })

  it("propagates installed acceptance failure without continuing or retrying", async () => {
    vi.mocked(runProcessStep).mockRejectedValueOnce(new Error("installed failed"))
    await expect(runVerify("artifacts")).rejects.toThrow("installed failed")
    expect(runProcessStep).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runProcessStep).mock.calls[0][0].args)
      .toEqual(["--filter", "@wanex/desktop", "test:installed"])
  })

  it("keeps the release gate broad and explicit", () => {
    const steps = createVerifySteps()

    expect(stepByName(steps, "TypeScript package checks").args).toEqual([
      "check"
    ])
    expect(stepByName(steps, "TypeScript package tests").args).toEqual([
      "test"
    ])
    expect(stepByName(steps, "Package governance audit").args).toEqual([
      "audit:package-governance"
    ])
    expect(stepByName(steps, "Distribution footprint audit tests").args).toEqual([
      "test:distribution-footprint-audit"
    ])
    expect(stepByName(steps, "Facade static footprint audit").args).toEqual([
      "audit:facade-footprint"
    ])
    expect(stepByName(steps, "Storage static boundary audit").args).toEqual([
      "audit:storage-boundary"
    ])
    expect(stepByName(steps, "Execution boundary audit tests").args).toEqual([
      "test:execution-boundary-audit"
    ])
    expect(stepByName(steps, "Execution boundary audit").args).toEqual([
      "audit:execution-boundaries"
    ])
    expect(stepByName(steps, "Storage RPC generation audit").args).toEqual([
      "audit:storage-rpc-generation"
    ])
    expect(stepByName(steps, "Storage RPC schema tests").args).toEqual([
      "test:storage-rpc-schema"
    ])
    expect(
      stepByName(steps, "Storage RPC schema migration policy tests").args
    ).toEqual(["test:storage-rpc-schema-migration-policy"])
    expect(stepByName(steps, "Assistant Host smoke script tests").args).toEqual([
      "test:assistant-host-smoke-script"
    ])
    expect(stepByName(steps, "Native artifact staging tests").args).toEqual([
      "test:native-artifact"
    ])
    expect(stepByName(steps, "Native Runtime proof tests").args).toEqual([
      "test:native-runtime-proof"
    ])
    expect(stepByName(steps, "Host distribution budget tests").args).toEqual([
      "test:host-distribution-budget"
    ])
    expect(stepByName(steps, "Desktop distribution receipt tests").args).toEqual([
      "test:desktop-distribution-receipt"
    ])
    expect(
      steps.some((step) => step.name === "Web application demo tests")
    ).toBe(false)
    expect(stepByName(steps, "TUI demo script tests").args).toEqual([
      "test:tui-script"
    ])
    expect(stepByName(steps, "Packed SDK runtime consumer proofs").args).toEqual([
      "proof:sdk-consumers"
    ])
    expect(stepByName(steps, "Installed TUI proof").args).toEqual([
      "proof:tui"
    ])
    expect(stepByName(steps, "Rust tests").args).toEqual(["test"])
    expect(stepByName(steps, "Rust clippy").args).toEqual([
      "clippy",
      "--all-targets",
      "--",
      "-D",
      "warnings"
    ])
    expect(stepByName(steps, "Eval harness CLI smoke").args).toEqual([
      "./scripts/run-eval-harness.mjs"
    ])
  })

  it("runs cheap contract gates before expensive integration proofs", () => {
    const steps = createVerifySteps()
    const names = steps.map((step) => step.name)
    const indexOf = (name) => names.indexOf(name)

    expect(indexOf("Facade static footprint audit")).toBeLessThan(
      indexOf("Native artifact staging tests")
    )
    expect(indexOf("TypeScript package checks")).toBeLessThan(
      indexOf("Native artifact staging tests")
    )
    expect(indexOf("TypeScript package tests")).toBeLessThan(
      indexOf("Native artifact staging tests")
    )
    expect(indexOf("Package governance audit")).toBeLessThan(
      indexOf("TypeScript package tests")
    )
    expect(indexOf("Distribution graph audit")).toBeLessThan(
      indexOf("TypeScript package tests")
    )
    expect(indexOf("Package packlist audit")).toBeLessThan(
      indexOf("Compiled SDK release proof")
    )
  })

  it("does not duplicate recursive workspace checks", () => {
    const names = createVerifySteps().map((step) => step.name)

    expect(names).not.toContain("Desktop typecheck")
    expect(names).not.toContain("Desktop policy tests")
    expect(names).not.toContain("TUI distribution tests")
  })
})

function stepByName(steps, name) {
  const step = steps.find((candidate) => candidate.name === name)
  if (step === undefined) {
    throw new Error(`missing verify step: ${name}`)
  }
  return step
}
