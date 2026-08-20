#!/usr/bin/env node
import { runProcessStep } from "./process-step.mjs"
import { workspaceRoot } from "./sdk/distribution-policy.mjs"

const args = process.argv.slice(2)

await runProcessStep({
  name: "Build current SDK staging",
  command: process.execPath,
  args: ["./scripts/build-sdk.mjs"]
}, { cwd: workspaceRoot })

await runProcessStep({
  name: "Generate SDK API reports",
  command: process.execPath,
  args: ["./scripts/generate-sdk-api-reports.mjs", ...args]
}, { cwd: workspaceRoot })
