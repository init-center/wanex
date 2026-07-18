#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { findStorageRpcOwnershipViolations } from "./audit/storage-rpc-ownership/ownership-policy.mjs"
import { findStorageRpcSchemaMigrationViolations } from "./audit/storage-rpc-ownership/schema-migration-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const storageSourceDir = join(rootDir, "packages/storage/src")
const ownership = JSON.parse(await readFile(join(rootDir, "docs/architecture/storage-rpc-ownership.json"), "utf8"))
const rpcSchema = JSON.parse(await readFile(join(rootDir, "schemas/storage-rpc/storage-rpc.schema.json"), "utf8"))
const rustSource = await readFile(join(rootDir, "crates/system-service/src/rpc.rs"), "utf8")
const typescriptCommandsByFile = {}
const typescriptSourcesByFile = {}

for (const file of (await readdir(storageSourceDir)).filter((name) => name.startsWith("store-") && name.endsWith(".ts")).sort()) {
  const source = await readFile(join(storageSourceDir, file), "utf8")
  typescriptSourcesByFile[file] = source
  typescriptCommandsByFile[file] = [...source.matchAll(/command: "([^"]+)"/g)].map((match) => match[1])
}

const requestStart = rustSource.indexOf("enum Request")
const requestEnd = rustSource.indexOf("const STORAGE_RPC_VERSION")
const requestSource = rustSource.slice(requestStart, requestEnd)
const handwrittenRustCommands = [...requestSource.matchAll(/^    ([A-Z][A-Za-z0-9]+)(?: \{|,)/gm)]
  .map((match) => pascalToKebab(match[1]))
const schemaCommands = Object.values(rpcSchema.$defs)
  .map((definition) => definition?.properties?.command?.enum)
  .filter((values) => Array.isArray(values) && values.length === 1)
  .map(([command]) => command)
  .filter((command) => command !== "rpc-describe")
const rustCommands = [...new Set([...schemaCommands, ...handwrittenRustCommands])]
const failures = [
  ...findStorageRpcOwnershipViolations({ ownership, typescriptCommandsByFile, rustCommands }),
  ...findStorageRpcSchemaMigrationViolations({
    schema: rpcSchema,
    ownership,
    handwrittenRustCommands,
    typescriptSourcesByFile
  })
]
const domains = Object.entries(ownership.domains)
const report = {
  domainCount: domains.length,
  coreCommandCount: domains.filter(([, entry]) => entry.classification === "core").reduce((sum, [, entry]) => sum + entry.commands.length, 0),
  optionalCommandCount: domains.filter(([, entry]) => entry.classification === "optional").reduce((sum, [, entry]) => sum + entry.commands.length, 0),
  typescriptCommandCount: Object.values(typescriptCommandsByFile).reduce((sum, commands) => sum + commands.length, 0),
  schemaCommandCount: schemaCommands.length,
  handwrittenRustCommandCount: handwrittenRustCommands.length,
  rustCommandCount: rustCommands.length,
  failures
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Storage RPC Ownership Audit")
  console.log("")
  console.log(`Domains: ${report.domainCount}`)
  console.log(`Core commands: ${report.coreCommandCount}`)
  console.log(`Optional commands: ${report.optionalCommandCount}`)
  console.log(`TypeScript commands: ${report.typescriptCommandCount}`)
  console.log(`Schema-owned commands: ${report.schemaCommandCount}`)
  console.log(`Handwritten Rust commands: ${report.handwrittenRustCommandCount}`)
  console.log(`Rust commands: ${report.rustCommandCount}`)
  console.log(`Failures: ${failures.length}`)
  for (const item of failures) console.log(`- [${item.code}] ${item.subject}: ${item.message}`)
}
if (failures.length > 0) process.exitCode = 1

function pascalToKebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}
