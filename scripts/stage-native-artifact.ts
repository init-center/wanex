#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import {
  nativeTargetId,
  parseStageNativeArtifactArgs,
  stageNativeArtifact
} from "./native-artifact/staging.js"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const options = parseStageNativeArtifactArgs(process.argv.slice(2))
const receipt = await stageNativeArtifact({
  workspaceRoot,
  targetId: options.targetId ?? nativeTargetId(),
  ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
  ...(options.sourceBin === undefined ? {} : { sourceBin: options.sourceBin }),
  ...(options.sourceBin === undefined ? {} : { build: false })
})

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
