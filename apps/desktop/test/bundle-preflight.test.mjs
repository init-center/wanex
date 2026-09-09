import { describe, expect, it } from "vitest"
import { assertDesktopBundleBudget } from "../scripts/preflight.mjs"

const asar = { bytes: 100, entries: ["/main.cjs", "/package.json", "/preload.cjs"] }
const budget = (maximum = 100) => ({
  kind: "wanex.host-distribution-budget",
  targets: {
    "darwin-arm64": { desktop: { maxAsarBytes: 200, exactAsarEntryCount: 3 } },
    "win32-x64": { desktop: { maxAsarBytes: maximum, exactAsarEntryCount: 3 } },
    "linux-x64": { native: {} }
  }
})

describe("current Desktop ASAR budget", () => {
  it("checks all declared Desktop ceilings including non-host targets", () => {
    expect(assertDesktopBundleBudget(asar, budget())).toEqual(["darwin-arm64", "win32-x64"])
    expect(() => assertDesktopBundleBudget(asar, budget(99))).toThrow("observed 100, maximum 99")
  })
  it.each([undefined, NaN, -1, 0, "100"])("rejects an invalid ceiling %s", (value) => {
    const limits = budget()
    limits.targets["win32-x64"].desktop.maxAsarBytes = value
    expect(() => assertDesktopBundleBudget(asar, limits)).toThrow("invalid ASAR ceiling")
  })
  it("rejects missing budgets and invalid artifact shape", () => {
    expect(() => assertDesktopBundleBudget(asar, {})).toThrow("invalid host distribution budget")
    expect(() => assertDesktopBundleBudget(asar, { ...budget(), targets: {} })).toThrow("targets are missing")
    expect(() => assertDesktopBundleBudget({ ...asar, bytes: 0 }, budget())).toThrow("invalid ASAR size")
    expect(() => assertDesktopBundleBudget({ ...asar, entries: [...asar.entries, "/source.ts"] }, budget())).toThrow("unexpected ASAR entries")
    const limits = budget()
    limits.targets["win32-x64"].desktop.exactAsarEntryCount = 4
    expect(() => assertDesktopBundleBudget(asar, limits)).toThrow("ASAR entry count")
  })
})
