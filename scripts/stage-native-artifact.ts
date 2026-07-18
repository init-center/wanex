#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  nativeTargetId,
  stageNativeArtifact
} from "./native-artifact/staging.js"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const options = parseArgs(process.argv.slice(2))
const receipt = await stageNativeArtifact({
  workspaceRoot,
  targetId: options.targetId ?? nativeTargetId(),
  ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
  ...(options.sourceBin === undefined ? {} : { sourceBin: options.sourceBin }),
  ...(options.sourceBin === undefined ? {} : { build: false })
})

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)

function parseArgs(values: readonly string[]): {
  readonly targetId?: string
  readonly outputDir?: string
  readonly sourceBin?: string
} {
  const parsed: { targetId?: string; outputDir?: string; sourceBin?: string } = {}
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index]
    const value = values[index + 1]
    if (
      name !== "--target" &&
      name !== "--output-dir" &&
      name !== "--source-bin"
    ) {
      throw new Error(`unknown native artifact argument: ${String(name)}`)
    }
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") parsed.targetId = value
    if (name === "--output-dir") parsed.outputDir = resolve(value)
    if (name === "--source-bin") parsed.sourceBin = resolve(value)
    index += 1
  }
  return parsed
}
