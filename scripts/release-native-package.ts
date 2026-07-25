#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import {
  createNativeNpmPackage,
  parseNativeNpmPackageArgs
} from "./native-artifact/npm-package.js"
import { nativeTargetId } from "./native-artifact/staging.js"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const options = parseNativeNpmPackageArgs(process.argv.slice(2))
const receipt = await createNativeNpmPackage({
  workspaceRoot,
  targetId: options.targetId ?? nativeTargetId(),
  ...(options.artifactDir === undefined
    ? {}
    : { artifactDir: options.artifactDir }),
  ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir })
})

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
