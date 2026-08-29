#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { projectModelsDevCatalog } from "../apps/assistant-host/src/model-catalog/validator.js"
import { renderLocalModelCatalogSource } from "../apps/assistant-host/src/model-catalog/generation.js"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const defaultOutput = resolve(
  rootDir,
  "apps/assistant-host/src/model-catalog/snapshot.generated.ts"
)
const options = parseArgs(process.argv.slice(2))
const payload = JSON.parse(await readFile(options.source, "utf8"))
const catalog = projectModelsDevCatalog(payload, "builtin")
const source = renderLocalModelCatalogSource(catalog)

if (options.check) {
  const current = await readFile(options.output, "utf8")
  if (current !== source) throw new Error("generated Assistant Host model catalog is stale")
} else {
  await writeFile(options.output, source, "utf8")
}

function parseArgs(args: readonly string[]): {
  readonly source: string
  readonly output: string
  readonly check: boolean
} {
  let source: string | undefined
  let output = defaultOutput
  let check = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--check") {
      check = true
      continue
    }
    if (arg === "--source" || arg === "--output") {
      const value = args[index + 1]
      if (value === undefined) throw new Error(`${arg} requires a path`)
      if (arg === "--source") source = resolve(value)
      else output = resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown model catalog generation argument: ${arg}`)
  }
  if (source === undefined) throw new Error("--source is required")
  return { source, output, check }
}
