import type { MessagePart, ProviderState } from "@wanex/protocol"
import {
  expectArray,
  expectString,
  isRecord,
  toRpcJsonValueFromUnknown
} from "./codec-common.js"
import type { MessagePartsWire } from "./generated/storage-rpc.js"

export function messagePartsToJson(
  parts: readonly MessagePart[]
): MessagePartsWire {
  return parts.map(toRpcJsonValueFromUnknown)
}

export function expectProviderState(value: unknown): ProviderState {
  if (!isRecord(value)) {
    throw new Error("provider state must be an object")
  }
  return value as unknown as ProviderState
}

export function messagePartFromJson(value: unknown): MessagePart {
  if (!isRecord(value)) {
    throw new Error("message part must be an object")
  }
  expectString(value.type, "message part.type")
  expectString(value.id, "message part.id")
  return value as unknown as MessagePart
}

export function messagePartsFromJson(value: unknown): readonly MessagePart[] {
  const parts = expectArray(value, "message parts")
  return parts.map((part, index) => {
    try {
      return messagePartFromJson(part)
    } catch (error) {
      throw new Error(`message part ${index}: ${(error as Error).message}`)
    }
  })
}
