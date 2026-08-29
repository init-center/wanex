import type { SurfaceClient } from "@wanex/assistant/surface"
import type {
  SideQuerySourceResult,
  SideQueryViewModel
} from "../model.js"

export function idleSideQuery(): SideQueryViewModel {
  return {
    kind: "web.side-query",
    state: "idle"
  }
}

export function projectSideQueryFromResult(
  result: SideQuerySourceResult,
  previous: SideQueryViewModel
): SideQueryViewModel {
  if (result.kind === "assistant.side-query") {
    return projectSideQuery(result)
  }
  if (result.kind === "assistant.side-query.found") {
    return projectSideQuery(result.query)
  }
  if (
    result.queryId === previous.queryId &&
    (result.kind === "assistant.side-query.missing" ||
      result.kind === "assistant.side-query.dismissed")
  ) {
    return idleSideQuery()
  }
  return previous
}

export async function reconcileSideQuery(request: {
  readonly client: SurfaceClient
  readonly previous: SideQueryViewModel
}): Promise<SideQueryViewModel> {
  if (request.previous.queryId === undefined) {
    return request.previous
  }
  const response = await request.client.readSideQuery({
    queryId: request.previous.queryId
  })
  return response.ok
    ? projectSideQueryFromResult(response.value, request.previous)
    : request.previous
}

function projectSideQuery(
  query: Extract<
    SideQuerySourceResult,
    { readonly kind: "assistant.side-query" }
  >
): SideQueryViewModel {
  return {
    kind: "web.side-query",
    state: query.state,
    queryId: query.queryId,
    sessionId: query.sessionId,
    question: query.question,
    ...(query.answerText === undefined ? {} : { answerText: query.answerText }),
    ...(query.answerTruncated === undefined
      ? {}
      : { answerTruncated: query.answerTruncated }),
    ...(query.error === undefined ? {} : { errorMessage: query.error.message }),
    startedAt: query.startedAt,
    updatedAt: query.updatedAt,
    ...(query.finishedAt === undefined ? {} : { finishedAt: query.finishedAt })
  }
}
