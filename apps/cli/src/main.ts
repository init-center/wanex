import { createStorageHandle } from "@wanex/storage"
import { createPluginStore } from "@wanex/storage/plugin"
import { parseCommand } from "./args.js"
import { diagnosticsValue } from "./commands/diagnostics.js"
import { doctorValue } from "./commands/doctor.js"
import { eventsValue } from "./commands/events.js"
import { helpValue } from "./commands/help.js"
import { memorySweepValue } from "./commands/memory.js"
import { providerGetValue, providerSetValue } from "./commands/provider.js"
import { runValue } from "./commands/run.js"
import { sideQueryValue } from "./commands/side-query.js"
import { supportBundleValue } from "./commands/support-bundle.js"
import { errorResult, ok } from "./output.js"
import type { CliEnvironment, CliResult } from "./types.js"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"

export async function main(
  argv: readonly string[],
  env: CliEnvironment = process.env
): Promise<CliResult> {
  try {
    const command = parseCommand(argv, env)
    if (command.name === "help") {
      return ok(helpValue())
    }

    const handle =
      command.options.store.kind === "local-system-service"
        ? createStorageHandle({
            kind: "local-system-service",
            mode: "oneshot",
            storeDir: command.options.store.storeDir,
            serviceBin: command.options.serviceBin
          })
        : createStorageHandle({
            kind: "local-profile",
            mode: "oneshot",
            rootDir: command.options.store.rootDir,
            profileId: command.options.store.profileId,
            serviceBin: command.options.serviceBin
          })

    const storage = Object.assign(
      {},
      handle.core,
      createPluginStore(handle.transport)
    )
    const secretResolver = new SecretResolver([new EnvSecretProvider(env)])
    try {
      if (command.name === "init") {
        return ok(await doctorValue(storage, "init", command.options))
      }
      if (command.name === "doctor") {
        return ok(await doctorValue(storage, "doctor", command.options))
      }
      if (command.name === "events") {
        return ok(await eventsValue(storage, command))
      }
      if (command.name === "diagnostics") {
        return ok(await diagnosticsValue(storage, command))
      }
      if (command.name === "support-bundle") {
        return ok(await supportBundleValue(storage, command))
      }
      if (command.name === "provider-set") {
        return ok(await providerSetValue(storage, command.profile))
      }
      if (command.name === "provider-get") {
        return ok(await providerGetValue(storage, command.profileId))
      }
      if (command.name === "memory-sweep") {
        return ok(await memorySweepValue(storage, command))
      }
      if (command.name === "side-query") {
        return ok(await sideQueryValue(storage, command, secretResolver))
      }
      return ok(await runValue(storage, command, secretResolver))
    } finally {
      await handle.dispose()
    }
  } catch (error) {
    return errorResult(error)
  }
}
