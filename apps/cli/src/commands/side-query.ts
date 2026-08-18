import { WanexAgentRuntime } from "@wanex/runtime/host"
import type { TextMessagePart } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { SecretResolverPort } from "@wanex/runtime/secrets"

const DEFAULT_LEASE_MS = 60_000

export async function sideQueryValue(
  storage: CoreStore,
  request: {
    readonly text: string
    readonly sessionId?: string
    readonly modelEndpointId: string
    readonly timeoutMs?: number
    readonly maxOutputTokens?: number
  },
  secretResolver: SecretResolverPort
): Promise<unknown> {
  const runtime = new WanexAgentRuntime({
    storage,
    leaseMs: DEFAULT_LEASE_MS,
    secretResolver,
    modelEndpointId: request.modelEndpointId,
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
  })

  try {
    const result = await runtime.runEphemeralQuery({
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      modelEndpointId: request.modelEndpointId,
      question: [{ type: "text", id: "side_query", text: request.text }],
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens })
    })
    return {
      command: "side-query",
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      modelEndpointId: request.modelEndpointId,
      persisted: false,
      outputText: textFromParts(result.output),
      output: result.output,
      evidence: result.evidence,
      telemetry: result.telemetry
    }
  } finally {
    await runtime.stop()
  }
}

function textFromParts(parts: readonly unknown[]): string {
  return parts
    .filter((part): part is TextMessagePart => {
      return (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text"
      )
    })
    .map((part) => part.text)
    .join("\n")
}
