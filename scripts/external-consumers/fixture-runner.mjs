import { execFile } from "node:child_process"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import {
  parseFixtureReceipt,
  validateExternalFixtureManifest
} from "./fixture-policy.mjs"
import {
  expectedInstalledWanexClosure,
  expectedWanexClosure,
  inspectExternalInstalledWanex,
  inspectExternalPackageLock
} from "./runner.mjs"
import { proveTamperedInstalledPackageFails } from "./native-package-proof.mjs"
import { resolveStepCommand } from "../process-step.mjs"

const execFileAsync = promisify(execFile)

export async function runExternalFixture(context) {
  const projectDir = join(context.externalRoot, context.fixture.id)
  const npmCache = join(context.externalRoot, "npm-cache", context.fixture.id)
  const runtimeRoot = join(projectDir, ".runtime")
  await cp(context.fixture.fixtureDir, projectDir, { recursive: true })
  await Promise.all([
    mkdir(npmCache, { recursive: true }),
    mkdir(runtimeRoot, { recursive: true })
  ])

  const sourceFiles = (await readdir(projectDir)).sort()
  if (
    JSON.stringify(sourceFiles) !==
      JSON.stringify([".runtime", "main.mjs", "package.json"])
  ) {
    throw new Error(
      `${context.fixture.id} contains unexpected source files: ${sourceFiles.join(",")}`
    )
  }
  const manifest = JSON.parse(
    await readFile(join(projectDir, "package.json"), "utf8")
  )
  const source = await readFile(join(projectDir, "main.mjs"), "utf8")
  if (
    context.fixture.systemServiceResolution === "automatic" &&
    (
      source.includes("WANEX_SYSTEM_SERVICE_BIN") ||
      /\bserviceBin\b/.test(source) ||
      source.includes("explicitPath")
    )
  ) {
    throw new Error(
      `${context.fixture.id} automatic artifact fixture contains an explicit binary path`
    )
  }
  const manifestFailures = validateExternalFixtureManifest(
    context.fixture,
    manifest
  )
  if (manifestFailures.length > 0) {
    throw new Error(
      `${context.fixture.id} manifest failed:\n${manifestFailures.join("\n")}`
    )
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
  const installCommand = resolveStepCommand({
    command: "npm",
    args: [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund"
    ]
  }, {
    env: childEnvironment
  })
  await execFileAsync(installCommand.command, installCommand.args, {
    cwd: projectDir,
    env: childEnvironment,
    maxBuffer: 20 * 1024 * 1024
  })

  const lock = JSON.parse(
    await readFile(join(projectDir, "package-lock.json"), "utf8")
  )
  const resolvedWanexClosure = expectedWanexClosure(
    context.fixture.dependencies,
    context.registryPackages
  )
  const lockFailures = inspectExternalPackageLock({
    lock,
    topLevelNames: context.fixture.dependencies,
    expectedWanex: resolvedWanexClosure,
    forbiddenPaths: [context.workspaceRoot, context.fixture.fixtureDir]
  })
  if (lockFailures.length > 0) {
    throw new Error(
      `${context.fixture.id} package lock failed:\n${lockFailures.join("\n")}`
    )
  }
  const installedWanexClosure = expectedInstalledWanexClosure(
    context.fixture.dependencies,
    context.registryPackages
  )
  const installedFailures = await inspectExternalInstalledWanex({
    projectDir,
    expectedWanex: installedWanexClosure
  })
  if (installedFailures.length > 0) {
    throw new Error(
      `${context.fixture.id} installed package directories failed:\n${installedFailures.join("\n")}`
    )
  }

  const executionEnvironment = {
    ...process.env,
    WANEX_FIXTURE_ROOT: runtimeRoot
  }
  delete executionEnvironment.WANEX_SYSTEM_SERVICE_BIN
  if (context.fixture.systemServiceResolution === "explicit") {
    executionEnvironment.WANEX_SYSTEM_SERVICE_BIN = context.serviceBin
  }
  const execution = await execFileAsync(process.execPath, ["main.mjs"], {
    cwd: projectDir,
    env: executionEnvironment,
    maxBuffer: 20 * 1024 * 1024
  })
  if (execution.stderr.trim().length > 0) process.stderr.write(execution.stderr)
  const receipt = parseFixtureReceipt(
    execution.stdout.trim(),
    context.fixture.id
  )
  if (context.fixture.id === "minimal-agent") {
    await proveTamperedInstalledPackageFails({
      projectDir,
      executionEnvironment,
      nativeReport: context.nativeReport
    })
  }
  process.stdout.write(
    `passed: ${context.fixture.id} (${
      Object.keys(resolvedWanexClosure).length
    } Wanex packages)\n`
  )
  return {
    id: context.fixture.id,
    topLevelDependencies: [...context.fixture.dependencies],
    resolvedWanexClosure,
    installedWanexClosure,
    receipt
  }
}
