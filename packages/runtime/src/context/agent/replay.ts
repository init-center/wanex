import type { CompiledContext } from "../memory/index.js"
import type { SessionInputRecord } from "@wanex/protocol"

export function sessionInputRecordsToReplayMessages(
  inputs: readonly SessionInputRecord[]
): CompiledContext["messages"] {
  return inputs.map((record) => ({
    role: record.inputType === "system" ? "system" : "user",
    content: record.content
  }))
}
