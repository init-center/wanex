import { createInterface } from "node:readline"
import { main } from "./index.js"

const argv = process.argv.slice(2)
const shutdown = new AbortController()
let signalCount = 0
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    signalCount += 1
    if (signalCount === 1) {
      shutdown.abort(new Error(`TUI received ${signal}`))
      return
    }
    process.exit(1)
  })
}
const input =
  argv[0] === "interactive"
    ? createInterface({
        input: process.stdin,
        crlfDelay: Infinity
      })
    : undefined
const usesInteractiveIo = input !== undefined
const usesFullScreenIo = argv[0] === "fullscreen"

const result = await main(
  argv,
  process.env,
  !usesInteractiveIo && !usesFullScreenIo
    ? undefined
    : {
        ...(input === undefined ? {} : { input }),
        signal: shutdown.signal,
        ...(input === undefined
          ? {}
          : {
              write(chunk: string) {
                process.stdout.write(chunk)
              }
            })
      }
)

input?.close()
if (result.stdout.length > 0) {
  process.stdout.write(result.stdout)
}
if (result.stderr.length > 0) {
  process.stderr.write(result.stderr)
}
process.exitCode = result.exitCode
