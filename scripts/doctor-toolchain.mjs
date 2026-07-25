#!/usr/bin/env node
import { execFile } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { resolveStepCommand } from "./process-step.mjs"

const execFileAsync = promisify(execFile)
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const requiredPackageManager = {
  name: "pnpm",
  version: ">=11 <12",
  pinnedVersion: "11.17.0"
}

export async function buildToolchainDoctorReport(options = {}) {
  const root = options.rootDir ?? rootDir
  const run = options.runCommand ?? runCommand
  const exists = options.exists ?? pathExists
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  )
  const packageManagerPolicy = resolvePackageManagerPolicy(packageJson)
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const checks = []

  checks.push(
    checkVersionRange({
      id: "node.version",
      label: "Node version",
      actual: nodeVersion,
      range: packageJson.engines?.node,
      required: true,
      formatter: (actual, range) => `Node ${actual} satisfies ${range}`,
      failureFormatter: (actual, range) =>
        `Node ${actual} does not satisfy ${range ?? "missing engines.node"}`
    })
  )
  checks.push(checkPackageManagerPolicy(packageManagerPolicy))
  checks.push(checkPackageManagerPin(packageJson.packageManager))
  checks.push(
    await checkCommandVersionRange({
      id: "pnpm.version",
      label: "pnpm version",
      command: "pnpm",
      args: ["--version"],
      range: packageManagerPolicy?.version,
      run,
      remediation:
        "Install pnpm 11 or run: npm exec --yes --package=pnpm@latest-11 -- pnpm verify"
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "npm.available",
      label: "npm available",
      command: "npm",
      args: ["--version"],
      required: true,
      run
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "corepack.available",
      label: "Corepack available",
      command: "corepack",
      args: ["--version"],
      required: false,
      run
    })
  )
  checks.push(
    await checkCorepackPnpm({
      range: packageManagerPolicy?.version,
      run
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "cargo.available",
      label: "Cargo available",
      command: "cargo",
      args: ["--version"],
      required: true,
      run
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "rustc.available",
      label: "rustc available",
      command: "rustc",
      args: ["--version"],
      required: true,
      run
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "cargo.fmt.available",
      label: "cargo fmt available",
      command: "cargo",
      args: ["fmt", "--version"],
      required: true,
      run
    })
  )
  checks.push(
    await checkCommandAvailable({
      id: "cargo.clippy.available",
      label: "cargo clippy available",
      command: "cargo",
      args: ["clippy", "--version"],
      required: true,
      run
    })
  )
  checks.push(
    await checkFileExists({
      id: "system_service.manifest",
      label: "system-service manifest",
      path: join(root, "crates/system-service/Cargo.toml"),
      exists,
      required: true
    })
  )
  checks.push(
    await checkFileExists({
      id: "system_service.debug_binary",
      label: "system-service debug binary",
      path: join(root, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`),
      exists,
      required: false
    })
  )

  const failedRequired = checks.filter(
    (check) => check.required && check.status === "fail"
  )

  return {
    generatedAt: new Date().toISOString(),
    rootDir: root,
    summary: {
      ok: failedRequired.length === 0,
      total: checks.length,
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: checks.filter((check) => check.status === "warn").length,
      failed: checks.filter((check) => check.status === "fail").length,
      failedRequired: failedRequired.length
    },
    toolchain: {
      node: {
        version: nodeVersion,
        expected: packageJson.engines?.node ?? null
      },
      packageManager: {
        raw: packageJson.engines?.pnpm ?? null,
        policy: packageManagerPolicy,
        packageManager: parsePackageManagerSpecifier(packageJson.packageManager)
      }
    },
    checks
  }
}

export function parsePackageManagerSpecifier(value) {
  if (typeof value !== "string") {
    return null
  }
  const atIndex = value.lastIndexOf("@")
  if (atIndex <= 0 || atIndex === value.length - 1) {
    return null
  }
  return {
    name: value.slice(0, atIndex),
    version: value.slice(atIndex + 1)
  }
}

export function resolvePackageManagerPolicy(packageJson) {
  const range = packageJson.engines?.pnpm
  if (typeof range !== "string" || range.length === 0) {
    return null
  }
  return {
    source: "engines.pnpm",
    name: "pnpm",
    version: range,
    onFail: null
  }
}

export function satisfiesVersionRange(version, range) {
  if (typeof range !== "string" || range.trim().length === 0) {
    return false
  }
  const comparators = range.trim().split(/\s+/)
  return comparators.every((comparator) =>
    satisfiesComparator(version, comparator)
  )
}

function checkVersionRange(request) {
  const range = typeof request.range === "string" ? request.range : null
  const ok = range !== null && satisfiesVersionRange(request.actual, range)
  return {
    id: request.id,
    label: request.label,
    required: request.required,
    status: ok ? "pass" : "fail",
    expected: range,
    actual: request.actual,
    message: ok
      ? request.formatter(request.actual, range)
      : request.failureFormatter(request.actual, range)
  }
}

function checkPackageManagerPolicy(policy) {
  const ok =
    policy?.source === "engines.pnpm" &&
    policy.name === requiredPackageManager.name &&
    policy.version === requiredPackageManager.version
  return {
    id: "package_manager.policy",
    label: "package manager policy",
    required: true,
    status: ok ? "pass" : "fail",
    expected: `engines.pnpm ${requiredPackageManager.version}`,
    actual:
      policy === null ? null : `${policy.source}: ${policy.name}@${policy.version}`,
    message: ok
      ? `${policy.source} declares pnpm ${policy.version}`
      : `engines.pnpm must declare ${requiredPackageManager.name} ${requiredPackageManager.version}`
  }
}

function checkPackageManagerPin(value) {
  const parsed = parsePackageManagerSpecifier(value)
  const ok =
    parsed?.name === requiredPackageManager.name &&
    parsed.version === requiredPackageManager.pinnedVersion
  return {
    id: "package_manager.pin",
    label: "package manager pin",
    required: true,
    status: ok ? "pass" : "fail",
    expected: `${requiredPackageManager.name}@${requiredPackageManager.pinnedVersion}`,
    actual: typeof value === "string" ? value : null,
    message: ok
      ? `packageManager pins ${parsed.name}@${parsed.version}`
      : `packageManager must pin ${requiredPackageManager.name}@${requiredPackageManager.pinnedVersion}`
  }
}

async function checkCommandVersionRange(request) {
  if (typeof request.range !== "string" || request.range.length === 0) {
    return {
      id: request.id,
      label: request.label,
      required: true,
      status: "fail",
      expected: null,
      actual: null,
      message: "expected version range is missing"
    }
  }
  const result = await request.run(request.command, request.args)
  if (!result.ok) {
    return commandFailure(request, result, true)
  }
  const actual = firstLine(result.stdout)
  const ok = satisfiesVersionRange(actual, request.range)
  return {
    id: request.id,
    label: request.label,
    required: true,
    status: ok ? "pass" : "fail",
    expected: request.range,
    actual,
    command: [request.command, ...request.args],
    message: ok
      ? `${request.command} reports ${actual}, satisfying ${request.range}`
      : `${request.command} reports ${actual}, expected ${request.range}`,
    remediation: ok ? undefined : request.remediation
  }
}

async function checkCommandAvailable(request) {
  const result = await request.run(request.command, request.args)
  const required = request.required ?? true
  if (!result.ok) {
    return commandFailure(request, result, required)
  }
  return {
    id: request.id,
    label: request.label,
    required,
    status: "pass",
    actual: firstLine(result.stdout),
    command: [request.command, ...request.args],
    message: `${request.label} is available`
  }
}

async function checkCorepackPnpm(request) {
  if (typeof request.range !== "string" || request.range.length === 0) {
    return {
      id: "corepack.pnpm.version",
      label: "Corepack pnpm resolution",
      required: false,
      status: "warn",
      expected: null,
      actual: null,
      message: "expected pnpm version range is missing"
    }
  }
  const result = await request.run("corepack", ["pnpm", "--version"])
  if (!result.ok) {
    return commandFailure(
      {
        id: "corepack.pnpm.version",
        label: "Corepack pnpm resolution",
        command: "corepack",
        args: ["pnpm", "--version"]
      },
      result,
      false
    )
  }
  const actual = firstLine(result.stdout)
  const ok = satisfiesVersionRange(actual, request.range)
  return {
    id: "corepack.pnpm.version",
    label: "Corepack pnpm resolution",
    required: false,
    status: ok ? "pass" : "warn",
    expected: request.range,
    actual,
    command: ["corepack", "pnpm", "--version"],
    message: ok
      ? `Corepack resolves pnpm ${actual}, satisfying ${request.range}`
      : `Corepack resolves pnpm ${actual}, expected ${request.range}`
  }
}

async function checkFileExists(request) {
  const found = await request.exists(request.path)
  return {
    id: request.id,
    label: request.label,
    required: request.required,
    status: found ? "pass" : request.required ? "fail" : "warn",
    expected: "exists",
    actual: found ? "exists" : "missing",
    path: request.path,
    message: found
      ? `${request.label} exists`
      : request.required
        ? `${request.label} is missing`
        : `${request.label} is not built yet`
  }
}

function commandFailure(request, result, required) {
  return {
    id: request.id,
    label: request.label,
    required,
    status: required ? "fail" : "warn",
    actual: null,
    command: [request.command, ...request.args],
    message: `${request.label} failed: ${result.error}`,
    detail: {
      exitCode: result.exitCode,
      stderr: result.stderr
    },
    remediation: request.remediation
  }
}

function satisfiesComparator(version, comparator) {
  if (comparator === "") {
    return true
  }
  const match = comparator.match(/^(>=|>|<=|<|=)?(\d+(?:\.\d+){0,2})$/)
  if (match === null) {
    return false
  }
  const operator = match[1] ?? "="
  const compared = compareVersions(version, match[2])
  if (operator === ">=") {
    return compared >= 0
  }
  if (operator === ">") {
    return compared > 0
  }
  if (operator === "<=") {
    return compared <= 0
  }
  if (operator === "<") {
    return compared < 0
  }
  return compared === 0
}

function compareVersions(left, right) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts[index] - rightParts[index]
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function versionParts(value) {
  const clean = value.replace(/^v/, "").split(/[+-]/)[0]
  const parts = clean.split(".").map((part) => Number.parseInt(part, 10))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function firstLine(value) {
  return value.trim().split(/\r?\n/)[0] ?? ""
}

async function runCommand(command, args) {
  try {
    const resolved = resolveStepCommand({ command, args })
    const result = await execFileAsync(resolved.command, resolved.args, {
      cwd: rootDir,
      timeout: 10_000,
      windowsHide: true
    })
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0
    }
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      exitCode: typeof error.code === "number" ? error.code : null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function printToolchainDoctorText(report) {
  console.log("Wanex Toolchain Doctor")
  console.log("")
  console.log(`Root: ${report.rootDir}`)
  console.log(`Status: ${report.summary.ok ? "ok" : "failed"}`)
  console.log(
    `Checks: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`
  )
  console.log("")
  for (const check of report.checks) {
    const marker =
      check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"
    console.log(`- [${marker}] ${check.id}: ${check.message}`)
    if (typeof check.remediation === "string") {
      console.log(`  Remediation: ${check.remediation}`)
    }
  }
}

if (import.meta.main) {
  const json = process.argv.includes("--json")
  const report = await buildToolchainDoctorReport()
  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printToolchainDoctorText(report)
  }
  if (!report.summary.ok) {
    process.exitCode = 1
  }
}
