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
      "provider",
      "set",
      "eval-cli-support",
      "--kind",
      "openai-compatible",
      "--provider-id",
      "deepseek",
      "--model",
      "deepseek-chat",
      "--api-key",
      "eval-cli-secret"
    ])
    await runCli(context, [
      "run",
      "eval cli support bundle",
      "--session",
      "ses_eval_cli_support_bundle"
    ])

    const response = await runCli(context, [
      "support-bundle",
      "--provider-profile",
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
    assert(!serialized.includes("eval-cli-secret"), "CLI bundle must redact secrets")
    const providers = expectArray(value.providers).map(expectRecord)
    assert(
      providers[0]?.profile !== undefined &&
        expectRecord(providers[0].profile).apiKey === "***",
      "CLI bundle should expose redacted provider profile"
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
