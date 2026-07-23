import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import {
  parseProductAppLocalCliOptions
} from "./cli-options.js"
import {
  formatProductAppLocalCliStartupSummary,
  formatProductAppLocalCliStartupSummaryJson
} from "./cli-summary.js"
import {
  openProductAppLocalBrowser
} from "./cli-open.js"
import {
  formatProductAppLocalCliProviderSetupResult,
  runProductAppLocalCliProviderSetup
} from "./cli-provider-setup.js"
import {
  formatProductAppLocalCliSmokeResult,
  runProductAppLocalCliSmoke
} from "./cli-smoke.js"
import { startProductAppLocalWebApp } from "./index.js"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
)

const options = parseProductAppLocalCliOptions({
  cwd: process.cwd(),
  artifactRoot: workspaceRoot,
  args: process.argv.slice(2),
  env: process.env
})
const app = await startProductAppLocalWebApp({
  storage: options.storage,
  serviceBin: options.serviceBin,
  providerProfiles: options.providerProfiles,
  secretResolver: new SecretResolver([new EnvSecretProvider(process.env)]),
  web: {
    hostname: options.hostname,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: options.pollIntervalMs })
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
  const smoke = await runProductAppLocalCliSmoke({
    app,
    options
  })
  console.log(formatProductAppLocalCliSmokeResult(smoke))
  await app.close()
  process.exit(smoke.ok ? 0 : 1)
}

if (options.setupProvider) {
  const setup = await runProductAppLocalCliProviderSetup({
    app,
    options
  })
  console.log(formatProductAppLocalCliProviderSetupResult(setup))
  await app.close()
  process.exit(setup.ok ? 0 : 1)
}

const snapshot = await app.readSnapshot()
if (options.summaryFormat === "json") {
  console.log(formatProductAppLocalCliStartupSummaryJson({
    options,
    snapshot
  }))
} else {
  for (const line of formatProductAppLocalCliStartupSummary({
    options,
    snapshot
  })) {
    console.log(line)
  }
}

if (options.open) {
  const opened = openProductAppLocalBrowser({ url: app.url })
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
