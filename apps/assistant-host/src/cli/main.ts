import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import {
  parseLocalCliOptions
} from "./options.js"
import {
  formatLocalCliStartupSummary,
  formatLocalCliStartupSummaryJson
} from "./summary.js"
import {
  openLocalBrowser
} from "./open.js"
import {
  formatLocalCliProviderSetupResult,
  runLocalCliProviderSetup
} from "./provider-setup.js"
import {
  formatLocalCliSmokeResult,
  runLocalCliSmoke
} from "./smoke.js"
import { startAssistantWebApp } from "../index.js"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
)

const options = parseLocalCliOptions({
  cwd: process.cwd(),
  artifactRoot: workspaceRoot,
  args: process.argv.slice(2),
  env: process.env
})
const app = await startAssistantWebApp({
  storage: options.storage,
  serviceBin: options.serviceBin,
  modelEndpoints: options.modelEndpoints,
  secretResolver: new SecretResolver([new EnvSecretProvider(process.env)]),
  web: {
    hostname: options.hostname,
    ...(options.port === undefined ? {} : { port: options.port })
  }
})

let shuttingDown = false
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  writeOperationalMessage("")
  writeOperationalMessage(`[wanex] shutting down (${signal})`)
  await app.close()
  process.exit(0)
}

process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})

if (options.smoke) {
  const smoke = await runLocalCliSmoke({
    app,
    options
  })
  console.log(formatLocalCliSmokeResult(smoke))
  await app.close()
  process.exit(smoke.ok ? 0 : 1)
}

if (options.setupProvider) {
  const setup = await runLocalCliProviderSetup({
    app,
    options
  })
  console.log(formatLocalCliProviderSetupResult(setup))
  await app.close()
  process.exit(setup.ok ? 0 : 1)
}

const snapshot = await app.readSnapshot()
if (options.summaryFormat === "json") {
  console.log(formatLocalCliStartupSummaryJson({
    options,
    snapshot
  }))
} else {
  for (const line of formatLocalCliStartupSummary({
    options,
    snapshot
  })) {
    console.log(line)
  }
}

if (options.open) {
  const opened = openLocalBrowser({ url: app.url })
  if (opened.ok) {
    writeOperationalMessage(`Opened browser: ${opened.command.command}`)
  } else {
    writeOperationalMessage(`[wanex] failed to open browser: ${opened.error.message}`)
  }
}

await new Promise(() => {})

function writeOperationalMessage(message: string): void {
  const output = options.summaryFormat === "json" ? console.error : console.log
  output(message)
}
