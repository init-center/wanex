#!/usr/bin/env node
import { mkdir, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor"
import {
  encodedPackageName,
  loadSdkDistributionPolicy,
  workspaceRoot
} from "./sdk/distribution-policy.mjs"

const options = parseArgs(process.argv.slice(2))
const policy = await loadSdkDistributionPolicy()
const baselineRoot = join(workspaceRoot, "docs/architecture/sdk-api")
const tempRoot = join(policy.outputDir, "reports/api-temp")
await mkdir(baselineRoot, { recursive: true })
await mkdir(tempRoot, { recursive: true })
const selected = options.packages.length === 0
  ? policy.packages
  : policy.packages.filter((item) => options.packages.includes(item.name))
const failures = []
let reportCount = 0

if (options.packages.length === 0) {
  const expectedReports = new Set(policy.packages.flatMap((packageInfo) =>
    packageInfo.entries.map((entry) =>
      `${encodedPackageName(packageInfo.name)}--${encodeEntry(entry.exportPath)}.api.md`
    )
  ))
  const staleReports = (await readdir(baselineRoot))
    .filter((name) => name.endsWith(".api.md") && !expectedReports.has(name))
    .sort()
  if (options.update) {
    await Promise.all(staleReports.map((name) =>
      rm(join(baselineRoot, name), { force: true })
    ))
  } else {
    failures.push(...staleReports.map((name) => ({
      entry: name,
      errors: 1,
      warnings: 0,
      messages: ["stale API report is outside the current SDK publication set"]
    })))
  }
}

for (const packageInfo of selected) {
  const stagingDir = join(
    policy.outputDir,
    "staging",
    encodedPackageName(packageInfo.name)
  )
  for (const entry of packageInfo.entries) {
    const reportName = `${encodedPackageName(packageInfo.name)}--${encodeEntry(entry.exportPath)}`
    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder: stagingDir,
        newlineKind: "lf",
        mainEntryPointFilePath: join(
          stagingDir,
          "dist",
          `${entry.artifactPath}.d.ts`
        ),
        compiler: {
          overrideTsconfig: {
            compilerOptions: {
              target: "ES2022",
              module: "NodeNext",
              moduleResolution: "NodeNext",
              strict: true,
              skipLibCheck: true
            }
          },
          skipLibCheck: true
        },
        apiReport: {
          enabled: true,
          reportFileName: reportName,
          reportFolder: baselineRoot,
          reportTempFolder: tempRoot,
          includeForgottenExports: true
        },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false }
      },
      configObjectFullPath: join(stagingDir, "api-extractor.json"),
      packageJsonFullPath: join(stagingDir, "package.json")
    })
    const messages = []
    const result = Extractor.invoke(config, {
      localBuild: options.update,
      showVerboseMessages: false,
      printApiReportDiff: !options.update,
      messageCallback(message) {
        messages.push(message.text)
        message.handled = true
      }
    })
    reportCount += 1
    if (!result.succeeded) {
      failures.push({
        entry: `${packageInfo.name}${entry.exportPath === "." ? "" : entry.exportPath.slice(1)}`,
        errors: result.errorCount,
        warnings: result.warningCount,
        messages
      })
    }
  }
  console.log(`${packageInfo.name}: ${packageInfo.entries.length} API reports`)
}

console.log(`SDK API reports: ${reportCount}`)
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `${failure.entry}: ${failure.errors} errors, ${failure.warnings} warnings`
    )
    for (const message of failure.messages.slice(0, 10)) console.error(`  ${message}`)
  }
  process.exitCode = 1
}

function encodeEntry(exportPath) {
  return exportPath === "."
    ? "root"
    : exportPath.slice(2).replaceAll("/", "-")
}

function parseArgs(args) {
  const packages = []
  let update = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--") continue
    if (arg === "--update") {
      update = true
      continue
    }
    if (arg === "--package") {
      const value = args[index + 1]
      if (value === undefined) throw new Error("--package requires a value")
      packages.push(value)
      index += 1
      continue
    }
    throw new Error(`unknown API report argument: ${String(arg)}`)
  }
  return { update, packages: [...new Set(packages)] }
}
