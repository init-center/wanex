import type {
  EvalScenario,
  EvalScenarioError,
  EvalScenarioResult,
  EvalSuiteResult,
  RunEvalSuiteOptions
} from "./types.js"

export function createEvalScenario(
  scenario: EvalScenario
): EvalScenario {
  if (scenario.id.length === 0) {
    throw new Error("eval scenario id must not be empty")
  }
  if (scenario.title.length === 0) {
    throw new Error("eval scenario title must not be empty")
  }
  return scenario
}

export async function runEvalSuite(
  options: RunEvalSuiteOptions
): Promise<EvalSuiteResult> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const only = new Set(options.only ?? [])
  const skip = new Set(options.skip ?? [])
  const results: EvalScenarioResult[] = []

  for (const scenario of options.scenarios) {
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
    const scenarioStartedAt = now()
    try {
      const output = await scenario.run(options.context)
      results.push({
        id: scenario.id,
        title: scenario.title,
        status: "passed",
        durationMs: Math.max(0, now() - scenarioStartedAt),
        tags,
        ...(output === undefined ? {} : { output })
      })
    } catch (error) {
      results.push({
        id: scenario.id,
        title: scenario.title,
        status: "failed",
        durationMs: Math.max(0, now() - scenarioStartedAt),
        tags,
        error: normalizeScenarioError(error)
      })
    }
  }

  const finishedAt = now()
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

function normalizeScenarioError(error: unknown): EvalScenarioError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack })
    }
  }
  return {
    message: String(error)
  }
}
