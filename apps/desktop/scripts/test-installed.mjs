#!/usr/bin/env node
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { runProcessStep } from "../../../scripts/process-step.mjs"
import {
  auditServerDistribution,
  buildServerDistribution,
  workspaceRoot
} from "../../../scripts/build-server-distribution.mjs"

export const packagedServerArtifactEnvironmentName = "WANEX_DESKTOP_TEST_SERVER_ARTIFACT"

if (import.meta.main) {
  await runDesktopInstalledTests({ env: process.env, vitestArgs: process.argv.slice(2) })
}

export async function runDesktopInstalledTests(options = {}) {
  const env = options.env ?? process.env
  const parent = join(workspaceRoot, "target/desktop-test-runs")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "run-"))
  let succeeded = false
  try {
    if (env.WANEX_SKIP_SYSTEM_SERVICE_BUILD !== "1") {
      await runProcessStep({
        name: "System service test binary",
        command: "cargo", args: ["build", "-p", "wanex-system-service"]
      }, { cwd: workspaceRoot, env })
    }
    // Compilation is a prerequisite, not part of a disconnected-work scenario.
    await runProcessStep({
      name: "Packaged Server release binary",
      command: "cargo", args: ["build", "--release", "-p", "wanex-system-service"]
    }, { cwd: workspaceRoot, env })
    const started = performance.now()
    const artifact = await buildServerDistribution({
      targetId: `${process.platform}-${process.arch}`,
      outputRoot: join(root, "server"),
      sourceBin: join(workspaceRoot, "target/release", `wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
    })
    await auditServerDistribution(artifact.outputRoot)
    console.log(`Packaged Server artifact validated in ${Math.round(performance.now() - started)}ms: ${artifact.outputRoot}`)
    await runProcessStep({
      name: "Desktop installed acceptance",
      command: "vitest", args: ["run", "--config", "vitest.installed.config.ts", ...(options.vitestArgs ?? [])]
    }, {
      cwd: join(workspaceRoot, "apps/desktop"),
      env: { ...env, [packagedServerArtifactEnvironmentName]: artifact.outputRoot }
    })
    succeeded = true
  } finally {
    if (succeeded) await rm(root, { recursive: true, force: true })
    else console.error(`Desktop test artifacts preserved: ${root}`)
  }
}
