import { main as runWanexCli } from "@wanex/cli"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  expectArray,
  expectRecord,
  expectString,
  payloadSessionId
} from "./helpers.js"

const FAKE_MODEL_ID = "eval-cli-diagnostics-model"
const LONG_TURN_PROMPT = "cli diagnostics ".repeat(900)

export const cliDiagnosticsOperationalScenario = createEvalScenario({
  id: "cli.diagnostics-operational",
  title: "CLI diagnostics projects queued memory maintenance without execution",
  tags: ["cli", "diagnostics", "memory", "product-path"],
  async run(context) {
    await runCli(context, [
      "model-endpoint",
      "set",
      "eval-cli-diagnostics",
      "--protocol",
      "fake",
      "--provider-id",
      "fake",
      "--model",
      FAKE_MODEL_ID,
      "--model-context-window-tokens",
      "9000",
      "--model-max-input-tokens",
      "9000",
      "--model-max-output-tokens",
      "500"
    ])
    await runCli(context, [
      "run",
      LONG_TURN_PROMPT,
      "--session",
      "ses_eval_cli_diagnostics",
      "--model-endpoint",
      "eval-cli-diagnostics"
    ])
    await runCli(context, [
      "run",
      LONG_TURN_PROMPT,
      "--session",
      "ses_eval_cli_diagnostics",
      "--model-endpoint",
      "eval-cli-diagnostics"
    ])
    await runCli(context, [
      "run",
      "third turn",
      "--session",
      "ses_eval_cli_diagnostics",
      "--model-endpoint",
      "eval-cli-diagnostics"
    ])
    const sweep = await runCli(context, [
      "memory",
      "sweep",
      "--minimum-token-savings",
      "1",
      "--idempotency-prefix",
      "eval-cli-diagnostics"
    ])
    const sweepJobs = expectArray(expectRecord(sweep.value).submittedJobs)
      .map(expectRecord)
      .filter((job) => job.sessionId === "ses_eval_cli_diagnostics")
    assert(
      sweepJobs.length === 1,
      "CLI diagnostics scenario requires one queued memory job"
    )
    const jobsBefore = await context.storage.listJobs({
      kind: "memory.compaction",
      limit: 50
    })

    const diagnostics = await runCli(context, [
      "diagnostics",
      "--memory-maintenance",
      "--limit",
      "100"
    ])
    const jobsAfter = await context.storage.listJobs({
      kind: "memory.compaction",
      limit: 50
    })
    const scenarioJobsBefore = jobsBefore.filter(
      (job) => payloadSessionId(job.payload) === "ses_eval_cli_diagnostics"
    )
    const scenarioJobsAfter = jobsAfter.filter(
      (job) => payloadSessionId(job.payload) === "ses_eval_cli_diagnostics"
    )

    const value = expectRecord(diagnostics.value)
    const entries = expectArray(value.diagnostics).map(expectRecord)
    assert(
      entries.some((entry) => entry.code === "memory.compaction.ready"),
      "CLI diagnostics should include queued memory job projection"
    )
    assert(
      entries.some((entry) => entry.code === "memory.maintenance.backlog.ready"),
      "CLI diagnostics should include memory maintenance backlog projection"
    )
    assert(
      JSON.stringify(scenarioJobsBefore.map((job) => [job.id, job.state])) ===
        JSON.stringify(scenarioJobsAfter.map((job) => [job.id, job.state])),
      "CLI diagnostics should not run or mutate queued jobs"
    )

    return {
      diagnosticCodes: entries.map((entry) => expectString(entry.code)),
      jobStates: scenarioJobsAfter.map((job) => job.state)
    }
  }
})

async function runCli(
  context: {
    readonly storeDir: string
    readonly serviceBin: string
  },
  args: readonly string[]
): Promise<Record<string, unknown>> {
  const result = await runWanexCli(args, {
    WANEX_STORE_DIR: context.storeDir,
    WANEX_SYSTEM_SERVICE_BIN: context.serviceBin
  })
  assert(result.exitCode === 0, `wanex CLI failed: ${result.stderr}`)
  assert(result.stderr.length === 0, "wanex CLI should not emit stderr")
  return expectRecord(JSON.parse(result.stdout))
}
