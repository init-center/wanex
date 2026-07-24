import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildToolchainDoctorReport,
  parsePackageManagerSpecifier,
  resolvePackageManagerPolicy,
  satisfiesVersionRange
} from "./doctor-toolchain.mjs"

const tempDirs = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("doctor-toolchain", () => {
  it("parses package manager declarations from the rightmost at sign", () => {
    expect(parsePackageManagerSpecifier("pnpm@11.9.0")).toEqual({
      name: "pnpm",
      version: "11.9.0"
    })
    expect(parsePackageManagerSpecifier("@scope/tool@1.2.3")).toEqual({
      name: "@scope/tool",
      version: "1.2.3"
    })
    expect(parsePackageManagerSpecifier("pnpm")).toBeNull()
  })

  it("resolves pnpm 11 package manager policy from engines", () => {
    expect(
      resolvePackageManagerPolicy({
        engines: {
          pnpm: ">=11 <12"
        }
      })
    ).toEqual({
      source: "engines.pnpm",
      name: "pnpm",
      version: ">=11 <12",
      onFail: null
    })
  })

  it("checks simple version comparator ranges", () => {
    expect(satisfiesVersionRange("26.4.0", ">=26")).toBe(true)
    expect(satisfiesVersionRange("26.4.0", ">=26 <27")).toBe(true)
    expect(satisfiesVersionRange("25.9.0", ">=26")).toBe(false)
    expect(satisfiesVersionRange("27.0.0", ">=26 <27")).toBe(false)
    expect(satisfiesVersionRange("11.7.0", ">=11 <12")).toBe(true)
    expect(satisfiesVersionRange("12.0.0", ">=11 <12")).toBe(false)
  })

  it("builds an ok report when required tools satisfy the manifest", async () => {
    const rootDir = await createFixtureRoot({
      packageManager: "pnpm@11.9.0",
      engines: {
        node: ">=26",
        pnpm: ">=11 <12"
      },
      binary: true
    })
    const report = await buildToolchainDoctorReport({
      rootDir,
      nodeVersion: "26.4.0",
      runCommand: fakeRunner({
        "pnpm --version": "11.7.0\n",
        "npm --version": "11.7.0\n",
        "corepack --version": "0.35.0\n",
        "corepack pnpm --version": "11.9.0\n",
        "cargo --version": "cargo 1.90.0\n",
        "rustc --version": "rustc 1.90.0\n",
        "cargo fmt --version": "rustfmt 1.90.0\n",
        "cargo clippy --version": "clippy 0.1.90\n"
      })
    })

    expect(report.summary.ok).toBe(true)
    expect(report.summary.failedRequired).toBe(0)
    expect(report.checks.find((check) => check.id === "node.version")).toMatchObject({
      status: "pass"
    })
    expect(report.checks.find((check) => check.id === "pnpm.version")).toMatchObject({
      status: "pass",
      expected: ">=11 <12",
      actual: "11.7.0"
    })
    expect(
      report.checks.find((check) => check.id === "package_manager.pin")
    ).toMatchObject({
      status: "pass",
      expected: "pnpm@11.9.0",
      actual: "pnpm@11.9.0"
    })
    expect(report.checks.find((check) => check.id === "npm.available"))
      .toMatchObject({
        status: "pass",
        required: true
      })
    expect(
      report.checks.find((check) => check.id === "system_service.debug_binary")
    ).toMatchObject({
      status: "pass",
      required: false
    })
  })

  it("fails required checks and warns for missing debug binary", async () => {
    const rootDir = await createFixtureRoot({
      packageManager: "pnpm@10.23.0",
      engines: {
        node: ">=26",
        pnpm: ">=11 <12"
      },
      binary: false
    })
    const report = await buildToolchainDoctorReport({
      rootDir,
      nodeVersion: "25.9.0",
      runCommand: fakeRunner({
        "pnpm --version": "10.18.0\n",
        "npm --version": "11.7.0\n",
        "corepack --version": "0.35.0\n",
        "corepack pnpm --version": "12.0.0\n",
        "cargo --version": "cargo 1.90.0\n",
        "rustc --version": "rustc 1.90.0\n",
        "cargo fmt --version": "rustfmt 1.90.0\n",
        "cargo clippy --version": "clippy 0.1.90\n"
      })
    })

    expect(report.summary.ok).toBe(false)
    expect(report.checks.find((check) => check.id === "node.version")).toMatchObject({
      status: "fail",
      required: true
    })
    expect(report.checks.find((check) => check.id === "pnpm.version")).toMatchObject({
      status: "fail",
      expected: ">=11 <12",
      actual: "10.18.0"
    })
    expect(
      report.checks.find((check) => check.id === "package_manager.pin")
    ).toMatchObject({
      status: "fail",
      required: true,
      expected: "pnpm@11.9.0",
      actual: "pnpm@10.23.0"
    })
    expect(
      report.checks.find((check) => check.id === "corepack.pnpm.version")
    ).toMatchObject({
      status: "warn",
      required: false,
      expected: ">=11 <12",
      actual: "12.0.0"
    })
    expect(
      report.checks.find((check) => check.id === "system_service.debug_binary")
    ).toMatchObject({
      status: "warn",
      required: false
    })
  })

  it("does not fail the report when Corepack is unavailable", async () => {
    const rootDir = await createFixtureRoot({
      packageManager: "pnpm@11.9.0",
      engines: {
        node: ">=26",
        pnpm: ">=11 <12"
      },
      binary: true
    })
    const report = await buildToolchainDoctorReport({
      rootDir,
      nodeVersion: "26.4.0",
      runCommand: fakeRunner({
        "pnpm --version": "11.7.0\n",
        "npm --version": "11.7.0\n",
        "cargo --version": "cargo 1.90.0\n",
        "rustc --version": "rustc 1.90.0\n",
        "cargo fmt --version": "rustfmt 1.90.0\n",
        "cargo clippy --version": "clippy 0.1.90\n"
      })
    })

    expect(report.summary.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "corepack.available")).toMatchObject({
      status: "warn",
      required: false
    })
    expect(
      report.checks.find((check) => check.id === "corepack.pnpm.version")
    ).toMatchObject({
      status: "warn",
      required: false
    })
  })
})

async function createFixtureRoot(options) {
  const rootDir = await mkdtemp(join(tmpdir(), "wanex-toolchain-doctor-"))
  tempDirs.push(rootDir)
  await mkdir(join(rootDir, "crates/system-service"), { recursive: true })
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        packageManager: options.packageManager,
        engines: options.engines
      },
      null,
      2
    )
  )
  await writeFile(join(rootDir, "crates/system-service/Cargo.toml"), "[package]\n")
  if (options.binary) {
    await mkdir(join(rootDir, "target/debug"), { recursive: true })
    await writeFile(join(rootDir, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`), "")
  }
  return rootDir
}

function fakeRunner(outputs) {
  return async (command, args) => {
    const key = [command, ...args].join(" ")
    const output = outputs[key]
    if (output === undefined) {
      return {
        ok: false,
        stdout: "",
        stderr: "",
        exitCode: 127,
        error: `missing fake command: ${key}`
      }
    }
    return {
      ok: true,
      stdout: output,
      stderr: "",
      exitCode: 0
    }
  }
}
