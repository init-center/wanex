#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as esbuildVersion } from "esbuild"
import { evaluateFacadeFootprint, refreshFacadeMeasurements } from "./audit/facade-footprint/facade-footprint-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const baselinePath = join(rootDir, "docs/architecture/facade-footprint-baseline.json")
const json = process.argv.includes("--json")
const enforce = process.argv.includes("--enforce")
const writeBaseline = process.argv.includes("--write-baseline")
const entries = {
  runtime: "packages/runtime/src/index.ts",
  app: "packages/app/src/index.ts"
}
const buildOptions = {
  bundle: true, format: "esm", platform: "node", target: "node24",
  treeShaking: true, minify: false, sourcemap: false, legalComments: "none"
}

const workspacePackages = await readWorkspacePackagePaths(rootDir)
const facades = {}
for (const [name, entry] of Object.entries(entries)) {
  facades[name] = await measureFacade({ entry, workspacePackages })
}

const report = { esbuildVersion, buildOptions, facades }
let baseline = JSON.parse(await readFile(baselinePath, "utf8"))
if (writeBaseline) {
  baseline = refreshFacadeMeasurements({ report, baseline })
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8")
}

const evaluation = evaluateFacadeFootprint({ report, baseline })
const { failures, notices, comparison } = evaluation
const output = { ...report, ...evaluation }

if (json) {
  console.log(JSON.stringify(output, null, 2))
} else {
  console.log("Wanex Facade Static Footprint Audit")
  console.log("")
  console.log(`esbuild: ${esbuildVersion}`)
  for (const notice of notices) console.log(`Notice: ${notice.message}`)
  for (const [name, facade] of Object.entries(facades)) {
    const change = comparison.changes[name]
    const delta = comparison.comparable && change !== undefined
      ? `; delta ${signed(change.outputBytesDelta)} bytes, ${signed(change.inputCountDelta)} inputs`
      : "; delta unavailable"
    console.log(`${name}: ${facade.outputBytes} bytes, ${facade.inputCount} inputs, ${facade.workspacePackages.length} workspace packages${delta}`)
  }
  console.log(`Failures: ${failures.length}`)
  for (const failure of failures) {
    console.log(`- [${failure.code}] ${failure.facade}: ${failure.message}`)
  }
}

function signed(value) {
  return value >= 0 ? `+${value}` : String(value)
}

if (enforce && failures.length > 0) {
  process.exitCode = 1
}

async function measureFacade({ entry, workspacePackages }) {
  const result = await build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    ...buildOptions,
    metafile: true,
    write: false,
    logLevel: "silent"
  })
  const inputs = Object.keys(result.metafile.inputs).sort()
  const contributingPackages = new Set()
  for (const input of inputs) {
    const packageName = packageForInput(input, workspacePackages)
    if (packageName !== undefined) {
      contributingPackages.add(packageName)
    }
  }
  return {
    entry,
    outputBytes: result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0),
    inputCount: inputs.length,
    workspacePackages: [...contributingPackages].sort()
  }
}

function packageForInput(input, workspacePackages) {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "")
  for (const entry of workspacePackages) {
    if (normalized === entry.path || normalized.startsWith(`${entry.path}/`)) {
      return entry.name
    }
  }
  return undefined
}

async function readWorkspacePackagePaths(workspaceRoot) {
  const packages = []
  for (const rootName of ["apps", "packages"]) {
    const entries = await readdir(join(workspaceRoot, rootName), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const packagePath = join(workspaceRoot, rootName, entry.name, "package.json")
      try {
        const manifest = JSON.parse(await readFile(packagePath, "utf8"))
        packages.push({
          name: manifest.name,
          path: relative(workspaceRoot, dirname(packagePath)).replaceAll("\\", "/")
        })
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error
        }
      }
    }
  }
  return packages.sort((left, right) => right.path.length - left.path.length)
}
