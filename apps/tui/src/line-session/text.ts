export function helpText(): string {
  return [
    "Commands:",
    "  help",
    "  ask <text>",
    "  steer <guidance>",
    "  btw <question>",
    "  btw-cancel",
    "  btw-dismiss",
    "  plan <planning-request>",
    "  plan-show",
    "  plan-cancel",
    "  plan-dismiss",
    "  plan-approve",
    "  plan-reject [reason]",
    "  plan-withdraw [reason]",
    "  plan-execute",
    "  goal",
    "  goal-start <json-request>",
    "  goal-pause [reason]",
    "  goal-resume [reason]",
    "  goal-cancel <reason>",
    "  attach <local-path>",
    "  model <endpoint-id>",
    "  select <session-id>",
    "  workbench [session-id]",
    "  operation [session-id]",
    "  cancel [reason]",
    "  regenerate [session-id]",
    "  approval-approve <approval-id> <reason>",
    "  approval-deny <approval-id> <reason>",
    "  commands",
    "  preview <command-id> [json-input]",
    "  execute <command-id> [json-input]",
    "  execution <job-id>",
    "  events [limit]",
    "  overview",
    "  refresh",
    "  quit"
  ].join("\n")
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
