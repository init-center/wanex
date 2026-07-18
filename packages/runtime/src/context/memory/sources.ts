import { isTerminalSessionInputState, type MessagePart } from "@wanex/protocol"
import type {
  CompileContextInput,
  ContextMemoryPolicy,
  ReplaySource
} from "./types.js"

export function sourcesForInput(input: CompileContextInput): ReplaySource[] {
  const inputSources = input.inputs.map((record): ReplaySource => ({
    role: record.inputType === "system" ? "system" : "user",
    content: record.content,
    inputId: record.id,
    inputStatus: record.status,
    createdAt: record.createdAt
  }))
  const messageSources = input.messages.map((record): ReplaySource => ({
    role: record.role,
    content: record.content,
    ...(record.inputId === undefined ? {} : { inputId: record.inputId }),
    messageId: record.id,
    createdAt: record.createdAt
  }))
  return [...inputSources, ...messageSources].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }
    return sourceStableId(left).localeCompare(sourceStableId(right))
  })
}

export function protectedRecentUserInputIds(
  sources: readonly ReplaySource[],
  policy: ContextMemoryPolicy
): Set<string> {
  if (policy.recentUserTurns <= 0) {
    return new Set()
  }
  const userInputs = [...sources
    .filter(
      (source): source is ReplaySource & { readonly inputId: string } =>
        source.role === "user" && source.inputId !== undefined
    )]
    .sort((left, right) => {
      const leftActive = isActiveInputSource(left)
      const rightActive = isActiveInputSource(right)
      if (leftActive === rightActive) {
        return 0
      }
      return leftActive ? 1 : -1
    })
    .map((source) => source.inputId)
  return new Set(userInputs.slice(-policy.recentUserTurns))
}

export function shouldProtectPart(
  source: ReplaySource,
  part: MessagePart,
  protectedInputIds: ReadonlySet<string>
): boolean {
  if (source.role === "user") {
    return true
  }
  if (
    source.role !== "tool" &&
    source.inputId !== undefined &&
    protectedInputIds.has(source.inputId)
  ) {
    return true
  }
  if (part.visibility === "provider_replay_only") {
    return true
  }
  return false
}

function sourceStableId(source: ReplaySource): string {
  return source.messageId ?? source.inputId ?? ""
}

function isActiveInputSource(source: ReplaySource): boolean {
  return (
    source.inputStatus !== undefined &&
    !isTerminalSessionInputState(source.inputStatus)
  )
}
