import { spawn } from "node:child_process"

const command = process.argv.slice(2)
if (process.platform !== "linux") {
  throw new Error("the Linux keyring session wrapper only runs on Linux")
}
if (process.env.CI !== "true") {
  throw new Error("the Linux keyring session wrapper is restricted to CI")
}
if (command.length === 0) {
  throw new Error("a command is required")
}

const bootstrap = String.raw`
set -euo pipefail
printf '%s' 'wanex-ci-keyring' | gnome-keyring-daemon --unlock >/dev/null
exec "$@"
`
const child = spawn(
  "dbus-run-session",
  ["--", "bash", "-ceu", bootstrap, "wanex-linux-keyring", ...command],
  { stdio: "inherit", env: process.env }
)

const status = await new Promise((resolve, reject) => {
  child.once("error", reject)
  child.once("exit", (code, signal) => resolve({ code, signal }))
})
if (status.code !== 0) {
  const detail = status.signal === null
    ? `exit code ${status.code ?? "unknown"}`
    : `signal ${status.signal}`
  throw new Error(`Linux keyring session command failed with ${detail}`)
}
