#!/usr/bin/env node
export { main } from "./cli-main.js"
export type { EvalCliEnvironment, EvalCliOptions } from "./cli-args.js"
export type {
  EvalCliResult,
  EvalCliScenarioProgress,
  RunEvalCliOptions
} from "./cli-main.js"

if (import.meta.main) {
  const { main } = await import("./cli-main.js")
  const result = await main(process.argv.slice(2), process.env, {
    onProgress(progress) {
      process.stderr.write(`${JSON.stringify(progress)}\n`)
    }
  })
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }
  process.exitCode = result.exitCode
}
