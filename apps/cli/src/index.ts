#!/usr/bin/env node
export { main } from "./main.js"
export type { CliEnvironment, CliResult } from "./types.js"

if (import.meta.main) {
  const { main } = await import("./main.js")
  const result = await main(process.argv.slice(2), process.env)
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }
  process.exitCode = result.exitCode
}
