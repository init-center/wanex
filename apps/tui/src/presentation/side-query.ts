import type { SideQueryReadModel } from "@wanex/assistant/surface"
import { singleLine } from "../line-session/text.js"
import type { TuiRenderedSideQuery } from "../model.js"

export function renderTuiSideQuery(
  query: SideQueryReadModel
): TuiRenderedSideQuery {
  const lines = [
    "Side query",
    `state:${query.state} | session:${query.sessionId}`,
    `query:${query.queryId}`,
    "",
    `question:${singleLine(query.question)}`,
    ...(query.answerText === undefined
      ? []
      : [
          `answer:${singleLine(query.answerText)}`,
          ...(query.answerTruncated === true ? ["answer:truncated"] : [])
        ]),
    ...(query.error === undefined
      ? []
      : [`error:${singleLine(query.error.message)}`])
  ]
  return {
    kind: "tui.side-query",
    state: query.state,
    queryId: query.queryId,
    sessionId: query.sessionId,
    lines,
    text: lines.join("\n")
  }
}
