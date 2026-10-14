import { join } from "node:path"
import { globSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { runProcessStep } from "./process-step.mjs"
import { auditServerDistribution, buildServerDistribution, workspaceRoot } from "./build-server-distribution.mjs"
import { packagedServerArtifactEnvironmentName, runDesktopInstalledTests } from "../apps/desktop/scripts/test-installed.mjs"
import packageTests from "../apps/desktop/vitest.config.ts"
import installedTests from "../apps/desktop/vitest.installed.config.ts"

vi.mock("node:fs/promises", async (original) => ({
  ...await original(), mkdir: vi.fn(), mkdtemp: vi.fn(), rm: vi.fn()
}))
vi.mock("./process-step.mjs", async (original) => ({
  ...await original(), runProcessStep: vi.fn()
}))
vi.mock("./build-server-distribution.mjs", async (original) => ({
  ...await original(), buildServerDistribution: vi.fn(), auditServerDistribution: vi.fn()
}))

const root = join(workspaceRoot, "target/desktop-test-runs/run-test")
const outputRoot = join(root, "server")

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(mkdtemp).mockResolvedValue(root)
  vi.mocked(buildServerDistribution).mockResolvedValue({ outputRoot })
})

describe("Desktop installed acceptance preparation", () => {
  it("discovers installed scenarios separately without losing ordinary package tests", () => {
    const cwd = join(workspaceRoot, "apps/desktop")
    const source = globSync(packageTests.test.include, { cwd })
    const installed = globSync(installedTests.test.include, { cwd })
    const all = globSync(["test/**/*.test.{ts,mjs}", "acceptance/**/*.test.{ts,mjs}"], { cwd })
    expect(source).toContain(join("test", "packaging-policy.test.mjs"))
    expect(installed).toEqual([join("acceptance", "packaged-server-workspace.test.mjs")])
    expect(new Set([...source, ...installed]).size).toBe(source.length + installed.length)
    expect([...source, ...installed].sort()).toEqual(all.sort())
  })

  it("builds current debug/release binaries and validates an isolated artifact before running the unchanged tests", async () => {
    await runDesktopInstalledTests({ env: {}, vitestArgs: ["--maxWorkers=1"] })
    const calls = vi.mocked(runProcessStep).mock.calls
    expect(calls.map(([step]) => step.args)).toEqual([
      ["build", "-p", "wanex-system-service"],
      ["build", "--release", "-p", "wanex-system-service"],
      ["run", "--config", "vitest.installed.config.ts", "--maxWorkers=1"]
    ])
    expect(buildServerDistribution).toHaveBeenCalledExactlyOnceWith({
      targetId: `${process.platform}-${process.arch}`, outputRoot,
      sourceBin: join(workspaceRoot, "target/release", `wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
    })
    expect(auditServerDistribution).toHaveBeenCalledExactlyOnceWith(outputRoot)
    expect(calls[2][1]).toEqual({
      cwd: join(workspaceRoot, "apps/desktop"),
      env: { [packagedServerArtifactEnvironmentName]: outputRoot }
    })
    expect(vi.mocked(buildServerDistribution).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(runProcessStep).mock.invocationCallOrder[1])
    expect(vi.mocked(auditServerDistribution).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runProcessStep).mock.invocationCallOrder[2])
    expect(mkdir).toHaveBeenCalledWith(join(workspaceRoot, "target/desktop-test-runs"), { recursive: true })
    expect(rm).toHaveBeenCalledExactlyOnceWith(root, { recursive: true, force: true })
  })

  it("never interprets the debug-build skip as permission to skip release validation", async () => {
    await runDesktopInstalledTests({ env: { WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1", [packagedServerArtifactEnvironmentName]: "untrusted-stale-artifact" } })
    expect(vi.mocked(runProcessStep).mock.calls[0][0].args).toEqual(["build", "--release", "-p", "wanex-system-service"])
    expect(vi.mocked(runProcessStep).mock.calls[1][1].env[packagedServerArtifactEnvironmentName]).toBe(outputRoot)
  })

  it("propagates compilation failure without assembling, testing or deleting evidence", async () => {
    vi.mocked(runProcessStep).mockRejectedValueOnce(new Error("compile failed"))
    await expect(runDesktopInstalledTests({ env: { WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1" } })).rejects.toThrow("compile failed")
    expect(runProcessStep).toHaveBeenCalledTimes(1)
    expect(buildServerDistribution).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it("does not start tests when artifact integrity validation fails", async () => {
    vi.mocked(auditServerDistribution).mockRejectedValueOnce(new Error("checksum mismatch"))
    await expect(runDesktopInstalledTests({ env: { WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1" } })).rejects.toThrow("checksum mismatch")
    expect(runProcessStep).toHaveBeenCalledTimes(1)
    expect(rm).not.toHaveBeenCalled()
  })

  it("propagates a test failure and preserves only its owned run directory", async () => {
    vi.mocked(runProcessStep).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("scenario failed"))
    await expect(runDesktopInstalledTests({ env: { WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1" } })).rejects.toThrow("scenario failed")
    expect(runProcessStep).toHaveBeenCalledTimes(2)
    expect(rm).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(`Desktop test artifacts preserved: ${root}`)
  })
})
