#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as esbuildVersion } from "esbuild"
import { findFacadeFootprintViolations } from "./audit/facade-footprint/facade-footprint-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const baselinePath = join(rootDir, "docs/architecture/facade-footprint-baseline.json")
const json = process.argv.includes("--json")
const enforce = process.argv.includes("--enforce")
const writeBaseline = process.argv.includes("--write-baseline")
const entries = {
  runtime: "packages/runtime/src/index.ts",
  app: "packages/app/src/index.ts"
}

const workspacePackages = await readWorkspacePackagePaths(rootDir)
const facades = {}
for (const [name, entry] of Object.entries(entries)) {
  facades[name] = await measureFacade({ entry, workspacePackages })
}

const report = { esbuildVersion, facades }
if (writeBaseline) {
  const baseline = {
    schemaVersion: 1,
    esbuildVersion,
    buildOptions: {
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      treeShaking: true,
      minify: false,
      sourcemap: false
    },
    forbiddenWorkspacePackages: [
      "@wanex/connector",
      "@wanex/plugin",
      "@wanex/team",
      "@wanex/workspace",
      "@wanex/product",
      "@wanex/plugin-command-host",
      "@wanex/local-host",
      "@wanex/tui",
      "@wanex/web"
    ],
    facades: Object.fromEntries(Object.entries(facades).map(([name, facade]) => [
      name,
      {
        entry: facade.entry,
        maxOutputBytes: facade.outputBytes,
        maxInputCount: facade.inputCount,
        allowedWorkspacePackages: facade.workspacePackages
      }
    ]))
  }
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8")
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
const failures = findFacadeFootprintViolations({ report, baseline })
const output = { ...report, failures }

if (json) {
  console.log(JSON.stringify(output, null, 2))
} else {
  console.log("Wanex Facade Static Footprint Audit")
  console.log("")
  console.log(`esbuild: ${esbuildVersion}`)
  for (const [name, facade] of Object.entries(facades)) {
    console.log(`${name}: ${facade.outputBytes} bytes, ${facade.inputCount} inputs, ${facade.workspacePackages.length} workspace packages`)
  }
  console.log(`Failures: ${failures.length}`)
  for (const failure of failures) {
    console.log(`- [${failure.code}] ${failure.facade}: ${failure.message}`)
  }
}

if (enforce && failures.length > 0) {
  process.exitCode = 1
}

async function measureFacade({ entry, workspacePackages }) {
  const result = await build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    treeShaking: true,
    minify: false,
    sourcemap: false,
    legalComments: "none",
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
