export function helpValue(): unknown {
  return {
    command: "help",
    usage: [
      "wanex init [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]",
      "wanex doctor [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]",
      "wanex diagnostics [--include-config-reloads] [--memory-maintenance] [--stale-after-ms <n>] [--policy-version <id>] [--session-limit <n>] [--limit <n>] [--plugin-limit <n>]",
      "wanex support-bundle [--provider-profile <id[,id]>] [--session <id>] [--event-limit <n>] [--job-limit <n>] [--plugin-limit <n>] [--memory-maintenance]",
      "wanex events [--session <id>] [--limit <n>]",
      "wanex memory sweep [--principal <id>] [--session-limit <n>] [--waterline-tokens <n>] [--minimum-token-savings <n>] [--policy-version <id>] [--idempotency-prefix <prefix>]",
      "wanex provider set <id> --kind <fake|openai-compatible|anthropic|deepseek> --provider-id <id> --model <model> [--base-url <url>] [--api-key <key>]",
      "wanex provider get <id>",
      "wanex side-query <text> [--session <id>] [--provider <id>] [--max-output-tokens <n>] [--timeout-ms <n>]",
      "wanex run <text> [--session <id>] [--provider <id>] [--to-completion [--max-steps <n>]] [--instructions-cwd <dir> [--instructions-project-root <dir>] [--instructions-global-dir <dir>] [--trust-project-instructions]] [--skills-cwd <dir> [--skills-project-root <dir>] [--skills-global-dir <dir[,dir]>] [--trust-project-skills] [--activate-skill-tool]] [--store <dir> | --store-profile <id> [--store-root <dir>]] [--service-bin <path>]"
    ]
  }
}
