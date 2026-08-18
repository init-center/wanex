export function helpValue(): unknown {
  return {
    command: "help",
    usage: [
      "wanex init [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]",
      "wanex doctor [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]",
      "wanex diagnostics [--include-config-reloads] [--memory-maintenance] [--stale-after-ms <n>] [--session-limit <n>] [--limit <n>] [--plugin-limit <n>]",
      "wanex support-bundle [--model-endpoint <id[,id]>] [--session <id>] [--event-limit <n>] [--job-limit <n>] [--plugin-limit <n>] [--memory-maintenance]",
      "wanex events [--session <id>] [--limit <n>]",
      "wanex memory sweep [--principal <id>] [--session-limit <n>] [--minimum-token-savings <n>] [--idempotency-prefix <prefix>]",
      "wanex model-endpoint set <id> --protocol <id> --provider-id <id> --model <model> [--connection-id <id>] [--operations <csv>] [--input-modalities <csv>] [--output-modalities <csv>] [--features <csv>] [--reasoning-replay <optional|required|forbidden>] [--model-context-window-tokens <n>] [--model-max-input-tokens <n>] [--model-max-output-tokens <n>] [--model-max-input-resources <n>] [--base-url <url>] [--secret-ref <ref>]",
      "wanex model-endpoint get <id>",
      "wanex side-query <text> [--session <id>] --model-endpoint <id> [--max-output-tokens <n>] [--timeout-ms <n>]",
      "wanex run <text> [--session <id>] --model-endpoint <id> [--max-steps <n>] [--instructions-cwd <dir> [--instructions-project-root <dir>] [--instructions-global-dir <dir>] [--trust-project-instructions]] [--skills-cwd <dir> [--skills-project-root <dir>] [--skills-global-dir <dir[,dir]>] [--trust-project-skills] [--activate-skill-tool]] [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]"
    ]
  }
}
