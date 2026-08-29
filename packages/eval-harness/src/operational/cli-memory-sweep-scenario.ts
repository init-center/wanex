import { main as runWanexCli } from "@wanex/cli"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  expectArray,
  expectRecord,
  expectStringArray
} from "./helpers.js"

const FAKE_MODEL_ID = "eval-cli-memory-model"
const LONG_TURN_PROMPT = "cli memory ".repeat(900)

export const cliMemorySweepOperationalScenario = createEvalScenario({
  id: "cli.memory-sweep-operational",
  title: "CLI memory sweep submits maintenance jobs idempotently",
  tags: ["cli", "memory", "maintenance", "assistant-path"],
  async run(context) {
    await runCli(context, [
      "model-endpoint",
      "set",
      "eval-cli-memory",
      "--protocol",
      "fake",
      "--provider-id",
      "fake",
      "--model",
      FAKE_MODEL_ID,
      "--model-context-window-tokens",
      "7000",
      "--model-max-input-tokens",
      "7000",
      "--model-max-output-tokens",
      "500"
    ])
    await runCli(context, [
      "run",
      LONG_TURN_PROMPT,
      "--session",
      "ses_eval_cli_memory",
      "--model-endpoint",
      "eval-cli-memory"
    ])
    await runCli(context, [
      "run",
      LONG_TURN_PROMPT,
      "--session",
      "ses_eval_cli_memory",
      "--model-endpoint",
      "eval-cli-memory"
    ])
    await runCli(context, [
      "run",
      "third turn",
      "--session",
      "ses_eval_cli_memory",
      "--model-endpoint",
      "eval-cli-memory"
    ])

    const first = await runCli(context, [
      "memory",
      "sweep",
      "--minimum-token-savings",
      "1",
      "--idempotency-prefix",
      "eval-cli-memory"
    ])
    const second = await runCli(context, [
      "memory",
      "sweep",
      "--minimum-token-savings",
      "1",
      "--idempotency-prefix",
      "eval-cli-memory"
    ])

    const firstValue = expectRecord(first.value)
    const secondValue = expectRecord(second.value)
    const firstJobs = expectArray(firstValue.submittedJobs)
    const secondJobs = expectArray(secondValue.submittedJobs)
    const firstScenarioJobs = firstJobs
      .map(expectRecord)
      .filter((job) => job.sessionId === "ses_eval_cli_memory")
    const secondScenarioJobs = secondJobs
      .map(expectRecord)
      .filter((job) => job.sessionId === "ses_eval_cli_memory")
    assert(
      expectStringArray(firstValue.scannedSessionIds).includes(
        "ses_eval_cli_memory"
      ),
      "CLI memory sweep should scan the scenario session"
    )
    assert(
      firstScenarioJobs.length === 1,
      "CLI memory sweep should submit one job for the scenario session"
    )
    assert(
      JSON.stringify(firstScenarioJobs) === JSON.stringify(secondScenarioJobs),
      "CLI memory sweep should be idempotent for the scenario session"
    )

    return {
      scannedSessionIds: expectStringArray(firstValue.scannedSessionIds),
      submittedJobCount: firstScenarioJobs.length,
      repeatedJobCount: secondScenarioJobs.length
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
