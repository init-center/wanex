import {
  parseDiagnosticsCommand,
  parseSupportBundleCommand
} from "./diagnostic-command-args.js"
import { parseCommandOptions } from "./command-options.js"
import { ensureNoPositionals } from "./parse-helpers.js"
import {
  parseMemoryCommand,
  parseProviderCommand
} from "./provider-command-args.js"
import type {
  CliAgentContextOptions,
  CliEnvironment,
  ParsedCommand
} from "./types.js"

export function parseCommand(
  argv: readonly string[],
  env: CliEnvironment
): ParsedCommand {
  const args = [...argv]
  const command = args.shift()
  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    return { name: "help" }
  }

  const globals = parseCommandOptions(args, env)
  if (command === "init") {
    ensureNoPositionals(globals.positionals, "init")
    return { name: "init", options: globals.options }
  }
  if (command === "doctor") {
    ensureNoPositionals(globals.positionals, "doctor")
    return { name: "doctor", options: globals.options }
  }
  if (command === "events") {
    ensureNoPositionals(globals.positionals, "events")
    return {
      name: "events",
      options: globals.options,
      ...(globals.sessionId === undefined ? {} : { sessionId: globals.sessionId }),
      ...(globals.limit === undefined ? {} : { limit: globals.limit })
    }
  }
  if (command === "diagnostics") {
    return parseDiagnosticsCommand(globals)
  }
  if (command === "support-bundle") {
    return parseSupportBundleCommand(globals)
  }
  if (command === "run") {
    if (globals.positionals.length === 0) {
      throw new Error("run requires text")
    }
    return withOptionalRunOptions(
      {
        name: "run",
        options: globals.options,
        text: globals.positionals.join(" ")
      },
      globals.sessionId,
      globals.providerId,
      globals.timeoutMs,
      globals.maxSteps,
      globals.context
    )
  }
  if (command === "side-query") {
    if (globals.positionals.length === 0) {
      throw new Error("side-query requires text")
    }
    return withOptionalSideQueryOptions(
      {
        name: "side-query",
        options: globals.options,
        text: globals.positionals.join(" ")
      },
      globals.sessionId,
      globals.providerId,
      globals.timeoutMs,
      globals.maxOutputTokens
    )
  }
  if (command === "provider") {
    return parseProviderCommand(globals)
  }
  if (command === "memory") {
    return parseMemoryCommand(globals)
  }

  throw new Error(`unknown command: ${command}`)
}

function withOptionalRunOptions(
  command: Omit<
    Extract<ParsedCommand, { readonly name: "run" }>,
    "sessionId" | "providerId" | "timeoutMs" | "maxSteps" | "context"
  >,
  sessionId: string | undefined,
  providerId: string | undefined,
  timeoutMs: number | undefined,
  maxSteps: number | undefined,
  context: CliAgentContextOptions | undefined
): Extract<ParsedCommand, { readonly name: "run" }> {
  return {
    ...command,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(providerId === undefined ? {} : { providerId }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(context === undefined ? {} : { context })
  }
}

function withOptionalSideQueryOptions(
  command: Omit<
    Extract<ParsedCommand, { readonly name: "side-query" }>,
    "sessionId"
  >,
  sessionId: string | undefined,
  providerId: string | undefined,
  timeoutMs: number | undefined,
  maxOutputTokens: number | undefined
): Extract<ParsedCommand, { readonly name: "side-query" }> {
  return {
    ...command,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(providerId === undefined ? {} : { providerId }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens })
  }
}
