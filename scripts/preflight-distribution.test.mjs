import { describe, expect, it } from "vitest"
import { createDistributionPreflightSteps } from "./preflight-distribution.mjs"

describe("distribution preflight", () => {
  it("keeps the low-cost lifecycle and distribution checks explicit", () => {
    const steps = createDistributionPreflightSteps()

    expect(steps.map((step) => step.name)).toEqual([
      "Git diff check",
      "Server type check",
      "TUI type check",
      "Desktop type check",
      "Server process lifecycle",
      "Server distribution proof contract",
      "Server distribution proof",
      "TUI distribution contracts",
      "Desktop distribution contracts"
    ])
    expect(steps.every((step) => !step.args.includes("verify"))).toBe(true)
    expect(steps.find((step) => step.name === "Server distribution proof")).toEqual({
      name: "Server distribution proof",
      command: "pnpm",
      args: ["proof:server-distribution"]
    })
  })
})
