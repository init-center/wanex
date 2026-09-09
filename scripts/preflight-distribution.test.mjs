import { beforeEach, describe, expect, it, vi } from "vitest"
import { createDistributionPreflightSteps, runDistributionPreflight } from "./preflight-distribution.mjs"
import { runProcessStep } from "./process-step.mjs"

vi.mock("./process-step.mjs", () => ({ runProcessStep: vi.fn() }))
beforeEach(() => vi.mocked(runProcessStep).mockReset())

describe("distribution preflight", () => {
  it("keeps the serial, complete distribution checks explicit", () => {
    const steps = createDistributionPreflightSteps()

    const indexOfArg = (arg) => steps.findIndex((step) => step.args.includes(arg))
    expect(indexOfArg("apps/desktop/scripts/preflight.mjs")).toBeGreaterThan(-1)
    expect(indexOfArg("test/distribution.test.mjs")).toBeGreaterThan(-1)
    expect(steps.every((step) => !step.args.includes("verify"))).toBe(true)
    const serverProof = steps.findIndex((step) => step.name === "Server distribution proof")
    const nativeProof = steps.findIndex((step) => step.name === "Native Runtime proof")
    const tuiProof = steps.findIndex((step) => step.name === "Installed TUI distribution proof")
    expect(serverProof).toBeGreaterThan(-1)
    expect(nativeProof).toBeGreaterThan(-1)
    expect(tuiProof).toBeGreaterThan(nativeProof)
    if (process.platform === "darwin" || process.platform === "win32") {
      const electron = steps.findIndex((step) => step.name === "Electron artifact preparation")
      const desktop = steps.findIndex((step) => step.name === "Installed Desktop proof")
      const receipt = steps.findIndex((step) => step.name === "Desktop distribution receipt")
      expect(electron).toBeGreaterThan(-1)
      expect(desktop).toBeGreaterThan(electron)
      expect(nativeProof).toBeGreaterThan(desktop)
      expect(receipt).toBeGreaterThan(tuiProof)
    }
    expect(steps.find((step) => step.name === "Server distribution proof")).toEqual({
      name: "Server distribution proof",
      command: "pnpm",
      args: ["proof:server-distribution", "--", "--target", `${process.platform}-${process.arch}`]
    })
  })

  it("awaits each check before starting another", async () => {
    let release
    vi.mocked(runProcessStep).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const result = runDistributionPreflight()
    expect(runProcessStep).toHaveBeenCalledTimes(1)
    release()
    await result
    expect(runProcessStep).toHaveBeenCalledTimes(createDistributionPreflightSteps().length)
  })

  it("stops on a failed check without running later proofs", async () => {
    vi.mocked(runProcessStep).mockRejectedValueOnce(new Error("check failed"))
    await expect(runDistributionPreflight()).rejects.toThrow("check failed")
    expect(runProcessStep).toHaveBeenCalledTimes(1)
  })
})
