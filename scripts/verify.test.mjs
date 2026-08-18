import { describe, expect, it } from "vitest"
import { createVerifySteps, parseVerifyArgs } from "./verify.mjs"

describe("verify", () => {
  it("rejects arguments because verify has a single release profile", () => {
    expect(parseVerifyArgs([])).toBeUndefined()
    expect(() => parseVerifyArgs(["--profile", "cool"])).toThrow(
      "unknown verify argument: --profile"
    )
    expect(() => parseVerifyArgs(["--profile=full"])).toThrow(
      "unknown verify argument: --profile=full"
    )
    expect(() => parseVerifyArgs(["--unknown"])).toThrow(
      "unknown verify argument: --unknown"
    )
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
    expect(stepByName(steps, "Facade static footprint audit").args).toEqual([
      "audit:facade-footprint"
    ])
    expect(stepByName(steps, "Storage static boundary audit").args).toEqual([
      "audit:storage-boundary"
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
    expect(stepByName(steps, "Local Host smoke script tests").args).toEqual([
      "test:local-host-smoke-script"
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
    expect(stepByName(steps, "Product Desktop typecheck").args).toEqual([
      "check:desktop"
    ])
    expect(stepByName(steps, "Product Desktop policy tests").args).toEqual([
      "test:desktop"
    ])
    expect(
      steps.some((step) => step.name === "Web application demo tests")
    ).toBe(false)
    expect(stepByName(steps, "TUI demo script tests").args).toEqual([
      "test:tui-script"
    ])
    expect(stepByName(steps, "TUI distribution tests").args).toEqual([
      "--filter",
      "@wanex/tui",
      "test",
      "--run",
      "test/distribution.test.mjs"
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
})

function stepByName(steps, name) {
  const step = steps.find((candidate) => candidate.name === name)
  if (step === undefined) {
    throw new Error(`missing verify step: ${name}`)
  }
  return step
}
