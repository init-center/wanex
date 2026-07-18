import { resolve } from "node:path"

export interface EvalCliEnvironment {
  readonly HOME?: string
  readonly USERPROFILE?: string
  readonly WANEX_EVAL_STORE_DIR?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
  readonly WANEX_PLUGIN_HOST_FIXTURE?: string
}

export interface EvalCliOptions {
  readonly storeDir?: string
  readonly serviceBin: string
  readonly pluginHostFixture: string
  readonly only: readonly string[]
  readonly skip: readonly string[]
}

export type ParsedEvalCliCommand =
  | {
      readonly name: "help"
    }
  | {
      readonly name: "run"
      readonly options: EvalCliOptions
    }

export function parseEvalCliCommand(
  argv: readonly string[],
  env: EvalCliEnvironment
): ParsedEvalCliCommand {
  const args = argv[0] === "--" ? argv.slice(1) : argv
  if (args.includes("--help") || args.includes("-h")) {
    return {
      name: "help"
    }
  }

  let storeDir = env.WANEX_EVAL_STORE_DIR
  let serviceBin = env.WANEX_SYSTEM_SERVICE_BIN
  let pluginHostFixture = env.WANEX_PLUGIN_HOST_FIXTURE
  const only: string[] = []
  const skip: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--store") {
      storeDir = requireValue(args, (index += 1), "--store")
      continue
    }
    if (arg === "--service-bin") {
      serviceBin = requireValue(args, (index += 1), "--service-bin")
      continue
    }
    if (arg === "--plugin-host-fixture") {
      pluginHostFixture = requireValue(args, (index += 1), "--plugin-host-fixture")
      continue
    }
    if (arg === "--only") {
      only.push(...parseIdList(requireValue(args, (index += 1), "--only")))
      continue
    }
    if (arg === "--skip") {
      skip.push(...parseIdList(requireValue(args, (index += 1), "--skip")))
      continue
    }
    if (arg?.startsWith("--") === true) {
      throw new Error(`unknown option: ${arg}`)
    }
    throw new Error(`unexpected positional argument: ${String(arg)}`)
  }

  if (serviceBin === undefined || serviceBin.length === 0) {
    throw new Error("missing --service-bin or WANEX_SYSTEM_SERVICE_BIN")
  }
  if (pluginHostFixture === undefined || pluginHostFixture.length === 0) {
    throw new Error(
      "missing --plugin-host-fixture or WANEX_PLUGIN_HOST_FIXTURE"
    )
  }

  return {
    name: "run",
    options: {
      ...(storeDir === undefined || storeDir.length === 0
        ? {}
        : { storeDir: resolve(storeDir) }),
      serviceBin: resolve(serviceBin),
      pluginHostFixture: resolve(pluginHostFixture),
      only: unique(only),
      skip: unique(skip)
    }
  }
}

function requireValue(
  args: readonly string[],
  index: number,
  option: string
): string {
  const value = args[index]
  if (value === undefined || value.length === 0) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

function parseIdList(value: string): readonly string[] {
  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (ids.length === 0) {
    throw new Error("scenario id list must not be empty")
  }
  return ids
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
