#!/usr/bin/env node
import {
  access,
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises"
import { constants } from "node:fs"
import { join, resolve } from "node:path"
import {
  loadSdkDistributionPolicy,
  nativePackageForTarget,
  workspaceRoot
} from "./sdk/distribution-policy.mjs"
import { loadExternalFixturePolicy } from "./external-consumers/fixture-policy.mjs"
import {
  loadNativeRegistryPackages,
  loadSdkRegistryPackages,
  startReadOnlyNpmRegistry
} from "./external-consumers/registry.mjs"
import {
  assertOnlyHostNativeTarballRequested,
  prepareExternalNativePackage,
  resolvePackagedServiceBinary
} from "./external-consumers/native-package-proof.mjs"
import { runExternalFixture } from "./external-consumers/fixture-runner.mjs"
import { withExternalFixtureRoot } from "./external-consumers/runner.mjs"

const args = parseArgs(process.argv.slice(2))
const policy = await loadSdkDistributionPolicy()
const nativeTarget = args.nativeTarget ?? `${process.platform}-${process.arch}`
const nativePackage = nativePackageForTarget(policy, nativeTarget)
if (
  nativePackage.platform !== process.platform ||
  nativePackage.arch !== process.arch
) {
  throw new Error(
    `native consumer proof target ${nativeTarget} differs from host ${process.platform}-${process.arch}`
  )
}
const report = JSON.parse(await readFile(
  join(policy.outputDir, "reports/artifacts.json"),
  "utf8"
))
const sourceServiceBin = args.nativePackageReport === undefined
  ? resolve(
      args.serviceBin ??
        join(
          workspaceRoot,
          `target/debug/wanex-system-service${
            process.platform === "win32" ? ".exe" : ""
          }`
        )
    )
  : undefined
if (sourceServiceBin !== undefined) {
  await access(sourceServiceBin, constants.X_OK)
}
const nativeReport = await prepareExternalNativePackage({
  workspaceRoot,
  nativePackage,
  sourceServiceBin,
  nativeArtifactDir: args.nativeArtifactDir,
  nativePackageReport: args.nativePackageReport
})
const packagedServiceBin = await resolvePackagedServiceBinary(nativeReport)
const registryPackages = [
  ...await loadSdkRegistryPackages(policy, report),
  ...await loadNativeRegistryPackages(policy, nativeReport)
]
const fixtures = await loadExternalFixturePolicy(workspaceRoot)
const registry = await startReadOnlyNpmRegistry({ packages: registryPackages })
let receipts

try {
  receipts = await withExternalFixtureRoot(workspaceRoot, async (externalRoot) => {
    const completed = []
    for (const fixture of fixtures) {
      process.stdout.write(`\n==> External consumer: ${fixture.id}\n`)
      completed.push(await runExternalFixture({
        fixture,
        externalRoot,
        registry,
        registryPackages,
        serviceBin: packagedServiceBin,
        nativeReport,
        workspaceRoot
      }))
    }
    return completed
  })
} finally {
  await registry.close()
}

assertOnlyHostNativeTarballRequested(registry.requests, nativeReport)

const evidence = {
  schemaVersion: 1,
  nativePackage: {
    name: nativeReport.name,
    targetId: nativeReport.targetId,
    filename: nativeReport.filename,
    bytes: nativeReport.bytes,
    sha256: nativeReport.sha256
  },
  fixtures: receipts.map((item) => ({
    id: item.id,
    topLevelDependencies: item.topLevelDependencies,
    resolvedWanexClosure: item.resolvedWanexClosure,
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

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === "--") continue
    if (value === "--service-bin") {
      const candidate = values[index + 1]
      if (!candidate) throw new Error("--service-bin requires a path")
      parsed.serviceBin = candidate
      index += 1
      continue
    }
    if (value === "--native-target") {
      const candidate = values[index + 1]
      if (!candidate) throw new Error("--native-target requires a value")
      parsed.nativeTarget = candidate
      index += 1
      continue
    }
    if (value === "--native-artifact-dir") {
      const candidate = values[index + 1]
      if (!candidate) throw new Error("--native-artifact-dir requires a path")
      parsed.nativeArtifactDir = resolve(candidate)
      index += 1
      continue
    }
    if (value === "--native-package-report") {
      const candidate = values[index + 1]
      if (!candidate) throw new Error("--native-package-report requires a path")
      parsed.nativePackageReport = resolve(candidate)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${value}`)
  }
  return parsed
}
