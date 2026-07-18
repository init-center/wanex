#!/usr/bin/env node
export { main } from "./cli-main.js"
export type { EvalCliEnvironment, EvalCliOptions } from "./cli-args.js"
export type { EvalCliResult } from "./cli-main.js"

if (import.meta.url === `file://${process.argv[1]}`) {
  const { main } = await import("./cli-main.js")
  const result = await main(process.argv.slice(2), process.env)
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }
  process.exitCode = result.exitCode
}
