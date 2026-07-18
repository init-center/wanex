import type { JsonValue } from "@wanex/protocol"
import { contextPolicyFromJson, contextPolicyToJson } from "./policy-codec.js"
import type { MemoryCompactionJobPayload } from "./types.js"
import { expectNonEmptyString, isRecord } from "./validation.js"

export function memoryCompactionPayloadFromJson(
  value: JsonValue
): MemoryCompactionJobPayload {
  if (!isRecord(value)) {
    throw new Error("memory.compaction payload must be an object")
  }
  const sessionId = expectNonEmptyString(
    value.sessionId,
    "memory.compaction.sessionId"
  )
  return {
    sessionId,
    ...(value.policy === undefined || value.policy === null
      ? {}
      : {
          policy: contextPolicyFromJson(
            value.policy,
            "memory.compaction.policy"
          )
        }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata })
  }
}

export function memoryCompactionPayloadToJson(
  payload: MemoryCompactionJobPayload
): JsonValue {
  return {
    sessionId: payload.sessionId,
    ...(payload.policy === undefined
      ? {}
      : { policy: contextPolicyToJson(payload.policy) }),
    ...(payload.metadata === undefined ? {} : { metadata: payload.metadata })
  }
}
