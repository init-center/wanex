#!/usr/bin/env node
import { execFile } from "node:child_process"
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises"
import { constants } from "node:fs"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  loadSdkDistributionPolicy,
  workspaceRoot
} from "./sdk/distribution-policy.mjs"
import {
  loadExternalFixturePolicy,
  parseFixtureReceipt,
  validateExternalFixtureManifest
} from "./external-consumers/fixture-policy.mjs"
import {
  loadSdkRegistryPackages,
  startReadOnlyNpmRegistry
} from "./external-consumers/registry.mjs"
import {
  expectedWanexClosure,
  inspectExternalPackageLock,
  withExternalFixtureRoot
} from "./external-consumers/runner.mjs"

const execFileAsync = promisify(execFile)
const args = parseArgs(process.argv.slice(2))
const serviceBin = resolve(
  args.serviceBin ?? join(workspaceRoot, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
)
await access(serviceBin, constants.X_OK)

const policy = await loadSdkDistributionPolicy()
const report = JSON.parse(await readFile(
  join(policy.outputDir, "reports/artifacts.json"),
  "utf8"
))
const registryPackages = await loadSdkRegistryPackages(policy, report)
const fixtures = await loadExternalFixturePolicy(workspaceRoot)
const registry = await startReadOnlyNpmRegistry({ packages: registryPackages })
let receipts

try {
  receipts = await withExternalFixtureRoot(workspaceRoot, async (externalRoot) => {
    const completed = []
    for (const fixture of fixtures) {
      process.stdout.write(`\n==> External consumer: ${fixture.id}\n`)
      completed.push(await runFixture({
        fixture,
        externalRoot,
        registry,
        registryPackages,
        serviceBin
      }))
    }
    return completed
  })
} finally {
  await registry.close()
}

const evidence = {
  schemaVersion: 1,
  fixtures: receipts.map((item) => ({
    id: item.id,
    topLevelDependencies: item.topLevelDependencies,
    installedWanexClosure: item.installedWanexClosure,
    receipt: item.receipt
  }))
}
const evidenceDir = join(workspaceRoot, "target/external-consumers")
await mkdir(evidenceDir, { recursive: true })
await writeFile(
  join(evidenceDir, "report.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8"
)

process.stdout.write("\nWanex External Consumer Proofs\n\n")
process.stdout.write(`Fixtures passed: ${receipts.length}\n`)
process.stdout.write(`Registry packages: ${registryPackages.length}\n`)
process.stdout.write(`Registry requests: ${registry.requests.length}\n`)
process.stdout.write("Failures: 0\n")

async function runFixture(context) {
  const projectDir = join(context.externalRoot, context.fixture.id)
  const npmCache = join(context.externalRoot, "npm-cache", context.fixture.id)
  const runtimeRoot = join(projectDir, ".runtime")
  await cp(context.fixture.fixtureDir, projectDir, { recursive: true })
  await Promise.all([
    mkdir(npmCache, { recursive: true }),
    mkdir(runtimeRoot, { recursive: true })
  ])

  const sourceFiles = (await readdir(projectDir)).sort()
  if (JSON.stringify(sourceFiles) !== JSON.stringify([".runtime", "main.mjs", "package.json"])) {
    throw new Error(`${context.fixture.id} contains unexpected source files: ${sourceFiles.join(",")}`)
  }
  const manifest = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"))
  const manifestFailures = validateExternalFixtureManifest(context.fixture, manifest)
  if (manifestFailures.length > 0) {
    throw new Error(`${context.fixture.id} manifest failed:\n${manifestFailures.join("\n")}`)
  }
  await writeFile(
    join(projectDir, ".npmrc"),
    `@wanex:registry=${context.registry.endpoint}\n`,
    "utf8"
  )

  const childEnvironment = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_update_notifier: "false"
  }
  await execFileAsync("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund"
  ], {
    cwd: projectDir,
    env: childEnvironment,
    maxBuffer: 20 * 1024 * 1024
  })

  const lock = JSON.parse(await readFile(join(projectDir, "package-lock.json"), "utf8"))
  const expectedClosure = expectedWanexClosure(
    context.fixture.dependencies,
    context.registryPackages
  )
  const lockFailures = inspectExternalPackageLock({
    lock,
    topLevelNames: context.fixture.dependencies,
    expectedWanex: expectedClosure,
    forbiddenPaths: [workspaceRoot, context.fixture.fixtureDir]
  })
  if (lockFailures.length > 0) {
    throw new Error(`${context.fixture.id} package lock failed:\n${lockFailures.join("\n")}`)
  }

  const execution = await execFileAsync(process.execPath, ["main.mjs"], {
    cwd: projectDir,
    env: {
      ...process.env,
      WANEX_FIXTURE_ROOT: runtimeRoot,
      WANEX_SYSTEM_SERVICE_BIN: context.serviceBin
    },
    maxBuffer: 20 * 1024 * 1024
  })
  if (execution.stderr.trim().length > 0) process.stderr.write(execution.stderr)
  const receipt = parseFixtureReceipt(execution.stdout.trim(), context.fixture.id)
  process.stdout.write(`passed: ${context.fixture.id} (${Object.keys(expectedClosure).length} Wanex packages)\n`)
  return {
    id: context.fixture.id,
    topLevelDependencies: [...context.fixture.dependencies],
    installedWanexClosure: expectedClosure,
    receipt
  }
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === "--service-bin") {
      const candidate = values[index + 1]
      if (!candidate) throw new Error("--service-bin requires a path")
      parsed.serviceBin = candidate
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${value}`)
  }
  return parsed
}
