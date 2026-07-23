import {
  buildGlobalRuntimeOptions,
  createGlobalRuntimeParseState,
  parseGlobalRuntimeOption
} from "./global-runtime-args.js"
import {
  parsePositiveInteger,
  requireValue
} from "./parse-helpers.js"
import type { ParsedGlobalOptions } from "./parsed-options.js"
import {
  buildRunContextOptions,
  createRunContextParseState,
  parseRunContextOption
} from "./run-context-args.js"
import type { CliEnvironment } from "./types.js"

export function parseCommandOptions(
  args: readonly string[],
  env: CliEnvironment
): ParsedGlobalOptions {
  const globalRuntime = createGlobalRuntimeParseState(env)
  let sessionId: string | undefined
  let providerId: string | undefined
  let limit: number | undefined
  let timeoutMs: number | undefined
  let maxSteps: number | undefined
  let maxOutputTokens: number | undefined
  const runContext = createRunContextParseState()
  const diagnosticsOptions: Record<string, string> = {}
  const supportOptions: Record<string, string> = {}
  const memoryOptions: Record<string, string> = {}
  const providerOptions: Record<string, string> = {}
  const positionals: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const globalRuntimeOption = parseGlobalRuntimeOption(args, index, globalRuntime)
    if (globalRuntimeOption.handled) {
      index = globalRuntimeOption.nextIndex
      continue
    }
    if (arg === "--session") {
      sessionId = requireValue(args, (index += 1), "--session")
      continue
    }
    if (arg === "--provider") {
      providerId = requireValue(args, (index += 1), "--provider")
      continue
    }
    if (arg === "--limit") {
      limit = parsePositiveInteger(
        requireValue(args, (index += 1), "--limit"),
        "--limit"
      )
      continue
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parsePositiveInteger(
        requireValue(args, (index += 1), "--timeout-ms"),
        "--timeout-ms"
      )
      continue
    }
    if (arg === "--max-steps") {
      maxSteps = parsePositiveInteger(
        requireValue(args, (index += 1), "--max-steps"),
        "--max-steps"
      )
      continue
    }
    if (arg === "--max-output-tokens") {
      maxOutputTokens = parsePositiveInteger(
        requireValue(args, (index += 1), "--max-output-tokens"),
        "--max-output-tokens"
      )
      continue
    }
    const runContextOption = parseRunContextOption(args, index, runContext)
    if (runContextOption.handled) {
      index = runContextOption.nextIndex
      continue
    }
    if (arg === "--include-config-reloads") {
      diagnosticsOptions.includeConfigReloads = "true"
      continue
    }
    if (arg === "--memory-maintenance") {
      diagnosticsOptions.memoryMaintenance = "true"
      supportOptions.memoryMaintenance = "true"
      continue
    }
    if (arg === "--stale-after-ms" || arg === "--plugin-limit") {
      const value = requireValue(args, (index += 1), arg)
      diagnosticsOptions[arg.slice(2)] = value
      supportOptions[arg.slice(2)] = value
      continue
    }
    if (
      arg === "--provider-profile" ||
      arg === "--event-limit" ||
      arg === "--job-limit"
    ) {
      supportOptions[arg.slice(2)] = requireValue(args, (index += 1), arg)
      continue
    }
    if (
      arg === "--kind" ||
      arg === "--provider-id" ||
      arg === "--model" ||
      arg === "--input-modalities" ||
      arg === "--output-modalities" ||
      arg === "--base-url" ||
      arg === "--secret-ref"
    ) {
      providerOptions[arg.slice(2)] = requireValue(args, (index += 1), arg)
      continue
    }
    if (
      arg === "--principal" ||
      arg === "--waterline-tokens" ||
      arg === "--minimum-token-savings" ||
      arg === "--idempotency-prefix"
    ) {
      memoryOptions[arg.slice(2)] = requireValue(args, (index += 1), arg)
      continue
    }
    if (arg === "--session-limit" || arg === "--policy-version") {
      const value = requireValue(args, (index += 1), arg)
      diagnosticsOptions[arg.slice(2)] = value
      memoryOptions[arg.slice(2)] = value
      supportOptions[arg.slice(2)] = value
      continue
    }
    if (arg?.startsWith("--") === true) {
      throw new Error(`unknown option: ${arg}`)
    }
    if (arg !== undefined) {
      positionals.push(arg)
    }
  }

  const context = buildRunContextOptions(runContext.context)

  return {
    options: buildGlobalRuntimeOptions(globalRuntime, env),
    positionals,
    diagnosticsOptions,
    supportOptions,
    memoryOptions,
    providerOptions,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(providerId === undefined ? {} : { providerId }),
    ...(limit === undefined ? {} : { limit }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(context === undefined ? {} : { context }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens })
  }
}
