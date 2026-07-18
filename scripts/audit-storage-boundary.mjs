#!/usr/bin/env node
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const entries = {
  storage: "packages/storage/src/index.ts",
  runtime: "packages/runtime/src/index.ts"
}
const optionalDomains = [
  "channel",
  "connector",
  "delegation",
  "objective",
  "plan",
  "plugin",
  "team",
  "workspace"
]
const failures = []
const inputsByEntry = {}

for (const [name, entry] of Object.entries(entries)) {
  const result = await build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    treeShaking: true,
    write: false,
    metafile: true,
    logLevel: "silent"
  })
  const inputs = Object.keys(result.metafile.inputs).sort()
  inputsByEntry[name] = inputs
  for (const input of inputs) {
    const storageFile = storageSourceFile(input)
    if (storageFile !== undefined && isOptionalStorageFile(storageFile)) {
      failures.push({ entry: name, input })
    }
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ inputsByEntry, failures }, null, 2))
} else {
  console.log("Wanex Storage Boundary Audit")
  console.log("")
  for (const [name, inputs] of Object.entries(inputsByEntry)) {
    console.log(`${name}: ${inputs.length} static inputs`)
  }
  console.log(`Failures: ${failures.length}`)
  for (const failure of failures) {
    console.log(`- ${failure.entry}: optional storage input ${failure.input}`)
  }
}

if (failures.length > 0) {
  process.exitCode = 1
}

function storageSourceFile(input) {
  const normalized = relative(rootDir, resolve(rootDir, input))
    .replaceAll("\\", "/")
  const prefix = "packages/storage/src/"
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined
}

function isOptionalStorageFile(file) {
  return optionalDomains.some(
    (domain) =>
      file === `${domain}.ts` ||
      file === `store-${domain}.ts` ||
      file === `types-${domain}.ts` ||
      file.startsWith(`codec-${domain}`)
  )
}
