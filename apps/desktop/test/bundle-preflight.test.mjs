import { describe, expect, it } from "vitest"
import { assertDesktopBundleShape } from "../scripts/preflight.mjs"

const asar = { bytes: 100, entries: ["/main.cjs", "/package.json", "/preload.cjs"] }
const budget = () => ({
  kind: "wanex.host-distribution-budget",
  targets: {
    "darwin-arm64": { desktop: { exactAsarEntryCount: 3 } },
    "win32-x64": { desktop: { exactAsarEntryCount: 3 } },
    "linux-x64": { native: {} }
  }
})

describe("current Desktop ASAR shape", () => {
  it("checks all declared Desktop shapes without a byte ceiling", () => {
    expect(assertDesktopBundleShape(asar, budget())).toEqual(["darwin-arm64", "win32-x64"])
    expect(assertDesktopBundleShape({ ...asar, bytes: 100_000_000 }, budget()))
      .toEqual(["darwin-arm64", "win32-x64"])
  })
  it.each([undefined, NaN, Infinity, -1, 0, 1.5, "100", Number.MAX_SAFE_INTEGER + 1])("rejects invalid measured bytes %s", (bytes) => {
    expect(() => assertDesktopBundleShape({ ...asar, bytes }, budget())).toThrow("invalid ASAR size")
  })
  it("rejects missing budgets and invalid artifact shape", () => {
    expect(() => assertDesktopBundleShape(asar, {})).toThrow("invalid host distribution budget")
    expect(() => assertDesktopBundleShape(asar, { ...budget(), targets: {} })).toThrow("targets are missing")
    expect(() => assertDesktopBundleShape({ ...asar, bytes: 0 }, budget())).toThrow("invalid ASAR size")
    expect(() => assertDesktopBundleShape({ ...asar, entries: [...asar.entries, "/source.ts"] }, budget())).toThrow("unexpected ASAR entries")
    const limits = budget()
    limits.targets["win32-x64"].desktop.exactAsarEntryCount = 4
    expect(() => assertDesktopBundleShape(asar, limits)).toThrow("ASAR entry count")
  })
})
