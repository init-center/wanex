import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import {
  parseLocalDemoOptions
} from "./options.js"
import {
  openLocalBrowser
} from "../cli/open.js"
import {
  startLocalDemoHost
} from "./host.js"

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
)

async function main(): Promise<void> {
  const options = parseLocalDemoOptions(
    workspaceRoot,
    process.argv.slice(2),
    process.env
  )
  const demo = await startLocalDemoHost(options)

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
  console.log("Wanex local host demo running")
  console.log(`URL: ${demo.url}`)
  console.log(`Store: ${demo.storeDir}`)
  console.log(`Service binary: ${demo.serviceBin}`)
  console.log(`Mode: ${demo.seed ? "seeded" : "blank"}`)
  console.log(`Session: ${demo.sessionId ?? "none"}`)
  console.log(
    `Provider: fake (${demo.seed ? "seeded demo turn" : "first turn on submit"})`
  )
  console.log("Stop: Ctrl+C")

  if (options.open) {
    const opened = openLocalBrowser({ url: demo.url })
    if (opened.ok) {
      console.log(`Opened browser: ${opened.command.command}`)
    } else {
      console.error(`[wanex] failed to open browser: ${opened.error.message}`)
    }
  }

  await new Promise(() => {})
}

await main()
