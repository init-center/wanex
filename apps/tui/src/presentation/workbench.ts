import type {
  TuiRenderedWorkbench,
  TuiWorkbench
} from "../model.js"
import { singleLine } from "../line-session/text.js"

export function renderTuiWorkbench(
  value: TuiWorkbench
): TuiRenderedWorkbench {
  if (value.kind === "assistant.workbench.no-session") {
    const lines = [
      "Workbench",
      "session:none",
      "",
      value.message
    ]
    return {
      kind: "tui.workbench",
      sourceKind: value.kind,
      rowCount: 0,
      inputCount: 0,
      messageCount: 0,
      visibleTextRows: 0,
      originKinds: [],
      lines,
      text: lines.join("\n")
    }
  }
  if (value.kind === "assistant.workbench.failed") {
    const lines = [
      "Workbench",
      `session:${value.sessionId ?? "none"}`,
      "",
      `error:${value.error.message}`
    ]
    return {
      kind: "tui.workbench",
      sourceKind: value.kind,
      ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
      rowCount: 0,
      inputCount: 0,
      messageCount: 0,
      visibleTextRows: 0,
      originKinds: [],
      lines,
      text: lines.join("\n")
    }
  }

  const workbench = value.workbench
  const summary = workbench.summary
  const lines = [
    "Workbench",
    [
      `session:${workbench.sessionId}`,
      `rows:${summary.rowCount}`,
      `inputs:${summary.inputCount}`,
      `messages:${summary.messageCount}`,
      `visible:${summary.visibleTextRows}`
    ].join(" | "),
    `origins:${summary.originKinds.length === 0 ? "none" : summary.originKinds.join(",")}`,
    ...(summary.latestUpdatedAt === undefined
      ? []
      : [`updated:${summary.latestUpdatedAt}`]),
    "",
    "Latest",
    `  user:${singleLine(summary.latestUserText ?? "none")}`,
    `  assistant:${singleLine(summary.latestAssistantText ?? "none")}`,
    "",
    "Actions",
    `  submit:${workbench.actions.submitCommandId}`,
    `  transcript:${workbench.actions.transcriptCommandId}`,
    `  provenance:${workbench.actions.provenanceCommandId}`
  ]

  return {
    kind: "tui.workbench",
    sourceKind: value.kind,
    sessionId: workbench.sessionId,
    rowCount: summary.rowCount,
    inputCount: summary.inputCount,
    messageCount: summary.messageCount,
    visibleTextRows: summary.visibleTextRows,
    originKinds: summary.originKinds,
    ...(summary.latestUpdatedAt === undefined
      ? {}
      : { latestUpdatedAt: summary.latestUpdatedAt }),
    ...(summary.latestUserText === undefined
      ? {}
      : { latestUserText: summary.latestUserText }),
    ...(summary.latestAssistantText === undefined
      ? {}
      : { latestAssistantText: summary.latestAssistantText }),
    lines,
    text: lines.join("\n")
  }
}
