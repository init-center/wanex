import type { ProductAppBackendInputRouterHost } from "./input-router-host.js"
import type { ProductAppBackendRouteInputResult } from "./types.js"

export async function routeProductAppBackendCommandText(
  host: ProductAppBackendInputRouterHost,
  text: string
): Promise<ProductAppBackendRouteInputResult> {
  const [command = "", ...args] = text.slice(1).split(/\s+/)
  switch (command) {
    case "status":
      return {
        kind: "read_model",
        command: "status",
        result: host.status()
      }
    case "diagnostics":
      return {
        kind: "read_model",
        command: "readDiagnostics",
        result: await host.commands.readDiagnostics()
      }
    case "support":
      return {
        kind: "read_model",
        command: "buildSupportBundle",
        result: await host.commands.buildSupportBundle()
      }
    case "context":
      return await routeContextCommand(host, args)
    case "shutdown":
      return {
        kind: "lifecycle",
        command: "shutdown",
        result: await host.commands.shutdown()
      }
    default:
      return {
        kind: "error",
        command: "routeInput",
        code: "unknown_command",
        message: `unknown product command: /${command}`
      }
  }
}

async function routeContextCommand(
  host: ProductAppBackendInputRouterHost,
  args: readonly string[]
): Promise<ProductAppBackendRouteInputResult> {
  const [subcommand = "", detail = ""] = args
  if (subcommand === "refresh") {
    return {
      kind: "context",
      command: "refreshAgentContextProfile",
      result: await host.commands.refreshAgentContextProfile()
    }
  }
  if (subcommand === "monitor" && detail === "start") {
    return {
      kind: "context",
      command: "startAgentContextMonitor",
      result: await host.commands.startAgentContextMonitor()
    }
  }
  if (subcommand === "monitor" && detail === "stop") {
    return {
      kind: "context",
      command: "stopAgentContextMonitor",
      result: await host.commands.stopAgentContextMonitor()
    }
  }
  return {
    kind: "error",
    command: "routeInput",
    code: "invalid_arguments",
    message:
      "expected /context refresh, /context monitor start, or /context monitor stop"
  }
}
