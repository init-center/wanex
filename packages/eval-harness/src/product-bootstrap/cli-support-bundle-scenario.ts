import { main as runWanexCli } from "@wanex/cli"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { expectArray, expectRecord } from "./helpers.js"

export const cliSupportBundleOperationalScenario = createEvalScenario({
  id: "cli.support-bundle-operational",
  title: "CLI support-bundle redacts credentials through product path",
  tags: ["cli", "support", "security", "product-path"],
  async run(context) {
    await runCli(context, [
      "model-endpoint",
      "set",
      "eval-cli-support",
      "--protocol",
      "fake",
      "--provider-id",
      "fake",
      "--model",
      "eval-cli-support-model",
      "--secret-ref",
      "env://EVAL_CLI_SUPPORT_API_KEY"
    ])
    await runCli(context, [
      "run",
      "eval cli support bundle",
      "--session",
      "ses_eval_cli_support_bundle",
      "--model-endpoint",
      "eval-cli-support"
    ])

    const response = await runCli(context, [
      "support-bundle",
      "--model-endpoint",
      "eval-cli-support",
      "--session",
      "ses_eval_cli_support_bundle",
      "--event-limit",
      "20",
      "--job-limit",
      "20",
      "--memory-maintenance"
    ])
    const value = expectRecord(response.value)
    const serialized = JSON.stringify(value)
    assert(!serialized.includes("EVAL_CLI_SUPPORT_API_KEY"), "CLI bundle must redact secret refs")
    const modelEndpoints = expectArray(value.modelEndpoints).map(expectRecord)
    assert(
      modelEndpoints[0]?.endpoint !== undefined &&
        expectRecord(modelEndpoints[0].endpoint).credentialConfigured === true &&
        !serialized.includes("secretRef"),
      "CLI bundle should expose only safe model endpoint metadata"
    )
    return {
      providerRedacted: true,
      eventCount: expectArray(value.events).length,
      diagnosticCount: expectArray(expectRecord(value.diagnostics).diagnostics).length
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
