import type { MessagePart, TextMessagePart } from "@wanex/protocol"
import type { BootstrappedWanexAppRuntime } from "./runtime.js"
import type {
  WanexAppAskSideQueryRequest,
  WanexAppAskSideQueryResult
} from "./types-workflow.js"
import { defaultPrincipalId, normalizeOptionalRef } from "./workflow-shared.js"

const defaultSideQuerySourceRef = "side-query"

export async function askWanexAppSideQuery(
  runtime: BootstrappedWanexAppRuntime,
  options: {
    readonly request: WanexAppAskSideQueryRequest
    readonly modelEndpointId: string
  }
): Promise<WanexAppAskSideQueryResult> {
  const question = normalizeQuestion(options.request.question)
  const sourceRef =
    normalizeOptionalRef(options.request.sourceRef) ?? defaultSideQuerySourceRef
  const host = runtime.app.createRuntimeHost({
    workerCount: 1,
    modelEndpointId: options.modelEndpointId
  })

  try {
    const result = await host.runEphemeralQuery({
      ...(options.request.sessionId === undefined
        ? {}
        : { sessionId: options.request.sessionId }),
      principalId: options.request.principalId ?? defaultPrincipalId,
      modelEndpointId: options.modelEndpointId,
      question,
      origin: {
        kind: "interactive",
        sourceRef
      },
      toolPolicy: "none",
      memoryPolicy: "exclude",
      persistence: "none",
      ...(options.request.signal === undefined
        ? {}
        : { signal: options.request.signal }),
      ...(options.request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: options.request.maxOutputTokens })
    })
    return {
      ...(options.request.sessionId === undefined
        ? {}
        : { sessionId: options.request.sessionId }),
      answerText: textFromParts(result.output),
      output: result.output,
      telemetry: result.telemetry ?? {},
      persisted: false,
      modelEndpointId: options.modelEndpointId
    }
  } finally {
    await host.stop()
  }
}

function normalizeQuestion(
  question: string | readonly MessagePart[]
): readonly MessagePart[] {
  if (typeof question !== "string") {
    if (question.length === 0) {
      throw new Error("side query question must not be empty")
    }
    return question
  }
  const text = question.trim()
  if (text.length === 0) {
    throw new Error("side query question must not be empty")
  }
  return [
    {
      type: "text",
      id: "side_query_text",
      text
    }
  ]
}

function textFromParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}
