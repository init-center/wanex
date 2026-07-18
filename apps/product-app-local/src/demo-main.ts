import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import {
  parseProductAppLocalDemoOptions
} from "./demo-options.js"
import {
  openProductAppLocalBrowser
} from "./cli-open.js"
import {
  startProductAppLocalDemoHost
} from "./demo-host.js"

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
)

async function main(): Promise<void> {
  const options = parseProductAppLocalDemoOptions(
    workspaceRoot,
    process.argv.slice(2),
    process.env
  )
  const demo = await startProductAppLocalDemoHost(options)

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.log("")
    console.log(`[wanex] shutting down (${signal})`)
    await demo.close()
    process.exit(0)
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT")
  })
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
  })

  console.log("")
  console.log("Wanex Product App Local demo running")
  console.log(`URL: ${demo.url}`)
  console.log(`Store: ${demo.storeDir}`)
  console.log(`Service binary: ${demo.serviceBin}`)
  console.log(`Mode: ${demo.seed ? "seeded" : "blank"}`)
  console.log(`Session: ${demo.sessionId ?? "none"}`)
  console.log(`Poll interval: ${formatPollInterval(demo.pollIntervalMs)}`)
  console.log(
    `Provider: fake (${demo.seed ? "seeded demo turn" : "first turn on submit"})`
  )
  console.log("Stop: Ctrl+C")

  if (options.open) {
    const opened = openProductAppLocalBrowser({ url: demo.url })
    if (opened.ok) {
      console.log(`Opened browser: ${opened.command.command}`)
    } else {
      console.error(`[wanex] failed to open browser: ${opened.error.message}`)
    }
  }

  await new Promise(() => {})
}

function formatPollInterval(value: number | undefined): string {
  if (value === undefined) {
    return "default"
  }
  if (value === 0) {
    return "disabled"
  }
  return `${value}ms`
}

await main()
