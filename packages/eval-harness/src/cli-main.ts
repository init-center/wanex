import {
  createEvalHarnessContext,
  createWanexRegressionScenarios,
  type EvalScenario,
  type EvalScenarioResult,
  type EvalSuiteResult,
  runEvalSuite
} from "./index.js"
import {
  parseEvalCliCommand,
  type EvalCliEnvironment
} from "./cli-args.js"

export interface EvalCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export async function main(
  argv: readonly string[],
  env: EvalCliEnvironment = process.env
): Promise<EvalCliResult> {
  return runEvalCli(argv, env, createWanexRegressionScenarios())
}

export async function runEvalCli(
  argv: readonly string[],
  env: EvalCliEnvironment,
  scenarios: readonly EvalScenario[]
): Promise<EvalCliResult> {
  try {
    const command = parseEvalCliCommand(argv, env)
    if (command.name === "help") {
      return ok(helpText())
    }

    if (command.options.storeDir === undefined) {
      const result = await runIsolatedEvalCliScenarios(
        command.options,
        scenarios
      )
      return suiteResult(result)
    }

    const { context, cleanup } = await createEvalHarnessContext({
      storeDir: command.options.storeDir,
      serviceBin: command.options.serviceBin,
      pluginHostFixture: command.options.pluginHostFixture
    })
    try {
      const result = await runEvalSuite({
        context,
        scenarios,
        only: command.options.only,
        skip: command.options.skip
      })
      return suiteResult(result)
    } finally {
      await cleanup()
    }
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${JSON.stringify({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      })}\n`
    }
  }
}

async function runIsolatedEvalCliScenarios(
  options: {
    readonly serviceBin: string
    readonly pluginHostFixture: string
    readonly only: readonly string[]
    readonly skip: readonly string[]
  },
  scenarios: readonly EvalScenario[]
): Promise<EvalSuiteResult> {
  const startedAt = Date.now()
  const only = new Set(options.only)
  const skip = new Set(options.skip)
  const results: EvalScenarioResult[] = []

  for (const scenario of scenarios) {
    const tags = [...(scenario.tags ?? [])]
    if (
      skip.has(scenario.id) ||
      (only.size > 0 && !only.has(scenario.id))
    ) {
      results.push({
        id: scenario.id,
        title: scenario.title,
        status: "skipped",
        durationMs: 0,
        tags
      })
      continue
    }

    const { context, cleanup } = await createEvalHarnessContext({
      serviceBin: options.serviceBin,
      pluginHostFixture: options.pluginHostFixture,
      prefix: `wanex-eval-${safeScenarioPrefix(scenario.id)}-`
    })
    try {
      const scenarioResult = await runEvalSuite({
        context,
        scenarios: [scenario]
      })
      results.push(scenarioResult.results[0] ?? {
        id: scenario.id,
        title: scenario.title,
        status: "failed",
        durationMs: 0,
        tags,
        error: {
          message: "isolated eval scenario did not produce a result"
        }
      })
    } finally {
      await cleanup()
    }
  }

  const finishedAt = Date.now()
  return {
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    totals: {
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length
    },
    results
  }
}

function safeScenarioPrefix(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48)
  return normalized.length === 0 ? "scenario" : normalized
}

function suiteResult(result: EvalSuiteResult): EvalCliResult {
  return {
    exitCode: result.totals.failed > 0 ? 1 : 0,
    stdout: `${JSON.stringify({ ok: result.totals.failed === 0, value: result }, null, 2)}\n`,
    stderr: ""
  }
}

function ok(value: unknown): EvalCliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ ok: true, value }, null, 2)}\n`,
    stderr: ""
  }
}

function helpText(): string {
  return [
    "wanex-eval",
    "",
    "Usage:",
    "  wanex-eval --service-bin <path> --plugin-host-fixture <path> [options]",
    "",
    "Options:",
    "  --store <dir>                 Persistent eval store directory",
    "  --service-bin <path>          wanex-system-service binary",
    "  --plugin-host-fixture <path>  Plugin host fixture for plugin scenarios",
    "  --only <id[,id]>              Run only selected scenario ids",
    "  --skip <id[,id]>              Skip selected scenario ids",
    "  --help                        Show help"
  ].join("\n")
}
