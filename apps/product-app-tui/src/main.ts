import { createInterface } from "node:readline"
import { main } from "./cli.js"

const argv = process.argv.slice(2)
const input =
  argv[0] === "interactive"
    ? createInterface({
        input: process.stdin,
        crlfDelay: Infinity
      })
    : undefined

const result = await main(
  argv,
  process.env,
  input === undefined
    ? undefined
    : {
        input,
        write(chunk) {
          process.stdout.write(chunk)
        }
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
