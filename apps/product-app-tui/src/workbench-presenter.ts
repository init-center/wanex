import type {
  ProductAppTuiRenderedWorkbench,
  ProductAppTuiWorkbench
} from "./types.js"
import { singleLine } from "./line-session-text.js"

export function renderProductAppTuiWorkbench(
  value: ProductAppTuiWorkbench
): ProductAppTuiRenderedWorkbench {
  if (value.kind === "product-app.workbench.no-session") {
    const lines = [
      "Wanex Product App Workbench",
      "session:none",
      "",
      value.message
    ]
    return {
      kind: "product-app-tui.workbench",
      sourceKind: value.kind,
      rowCount: 0,
      inputCount: 0,
      messageCount: 0,
      visibleTextRows: 0,
      originKinds: [],
      continued: false,
      lines,
      text: lines.join("\n")
    }
  }
  if (value.kind === "product-app.workbench.failed") {
    const lines = [
      "Wanex Product App Workbench",
      `session:${value.sessionId ?? "none"}`,
      "",
      `error:${value.error.message}`
    ]
    return {
      kind: "product-app-tui.workbench",
      sourceKind: value.kind,
      ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
      rowCount: 0,
      inputCount: 0,
      messageCount: 0,
      visibleTextRows: 0,
      originKinds: [],
      continued: false,
      lines,
      text: lines.join("\n")
    }
  }

  const workbench =
    value.kind === "product-app.workbench.continued"
      ? value.result.workbench
      : value.workbench
  const continued = value.kind === "product-app.workbench.continued"
  const summary = workbench.summary
  const lines = [
    "Wanex Product App Workbench",
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
    `  continue:${workbench.actions.continueCommandId}`,
    `  transcript:${workbench.actions.transcriptCommandId}`,
    `  provenance:${workbench.actions.provenanceCommandId}`,
    ...(continued
      ? [
          "",
          "Continued",
          `  assistant:${singleLine(value.result.turn.assistantText)}`
        ]
      : [])
  ]

  return {
    kind: "product-app-tui.workbench",
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
    continued,
    lines,
    text: lines.join("\n")
  }
}
