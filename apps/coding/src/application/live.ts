import type {
  CodingLiveToolActivityReadModel,
  CodingLiveTurnPhase,
  CodingLiveTurnReadModel,
} from "./model.js"
import type { CodingTurnReference } from "../host/types.js"
import type { ProviderRunEvent } from "@wanex/runtime/provider"

const MAX_ASSISTANT_TEXT_BYTES = 65_536
const MAX_TOOL_ACTIVITIES = 32
const MAX_TOOL_NAME_BYTES = 256

interface LiveToolActivity {
  readonly callId: string
  readonly ordinal: number
  name: string
  nameTruncated: boolean
  state: "streaming" | "ready"
}

export class CodingLiveTurnProjection {
  readonly #reference: CodingTurnReference
  readonly #activities: LiveToolActivity[] = []
  readonly #activityByCallId = new Map<string, LiveToolActivity>()
  #attemptId: string | undefined
  #assistantText = ""
  #assistantTextTruncated = false
  #activitiesTruncated = false
  #phase: CodingLiveTurnPhase = "starting"
  #revision = 1
  #updatedAt = Date.now()
  #attemptProducedOutput = false

  constructor(reference: CodingTurnReference) {
    this.#reference = { ...reference }
  }

  get revision(): number {
    return this.#revision
  }

  setPhase(phase: CodingLiveTurnPhase): boolean {
    return this.update(() => {
      if (this.#phase === phase) return false
      this.#phase = phase
      return true
    })
  }

  prepareNextAttempt(): void {
    this.#attemptId = undefined
    this.#attemptProducedOutput = false
  }

  applyProviderEvent(event: ProviderRunEvent): boolean {
    if (!sameReference(this.#reference, event)) return false
    if (this.#attemptId === undefined) {
      this.#attemptId = event.attemptId
    } else if (this.#attemptId !== event.attemptId) {
      return false
    }
    return this.update(() => this.apply(event.event))
  }

  read(projectId: string): CodingLiveTurnReadModel {
    return {
      projectId,
      sessionId: this.#reference.sessionId,
      turnId: this.#reference.turnId,
      revision: this.#revision,
      updatedAt: this.#updatedAt,
      phase: this.#phase,
      assistantText: this.#assistantText,
      assistantTextTruncated: this.#assistantTextTruncated,
      activities: this.#activities.map((activity) => ({
        ordinal: activity.ordinal,
        ...(activity.name.length === 0 ? {} : { name: activity.name }),
        nameTruncated: activity.nameTruncated,
        state: activity.state,
      })),
      activitiesTruncated: this.#activitiesTruncated,
    }
  }

  private apply(event: ProviderRunEvent["event"]): boolean {
    switch (event.type) {
      case "text_delta": {
        const next = appendBounded(
          this.#assistantText,
          event.delta,
          MAX_ASSISTANT_TEXT_BYTES,
        )
        const changed =
          next.value !== this.#assistantText ||
          next.truncated !== this.#assistantTextTruncated
        this.#assistantText = next.value
        this.#assistantTextTruncated = next.truncated
        this.#attemptProducedOutput = true
        if (this.#phase !== "responding") {
          this.#phase = "responding"
          return true
        }
        return changed
      }
      case "reasoning_delta":
        this.#attemptProducedOutput = true
        return this.setPhaseInternal("thinking")
      case "provider_state":
        return event.state.stateKind === "reasoning" ||
          event.state.stateKind === "thinking"
          ? this.setPhaseInternal("thinking")
          : false
      case "tool_call_start": {
        this.#attemptProducedOutput = true
        if (this.#activityByCallId.has(event.toolCallId)) return false
        if (this.#activities.length >= MAX_TOOL_ACTIVITIES) {
          const changed = !this.#activitiesTruncated
          this.#activitiesTruncated = true
          return changed || this.setPhaseInternal("tool_calling")
        }
        const activity: LiveToolActivity = {
          callId: event.toolCallId,
          ordinal: this.#activities.length + 1,
          name: "",
          nameTruncated: false,
          state: "streaming",
        }
        this.#activities.push(activity)
        this.#activityByCallId.set(activity.callId, activity)
        this.#phase = "tool_calling"
        return true
      }
      case "tool_call_delta": {
        const activity = this.#activityByCallId.get(event.toolCallId)
        if (activity === undefined || event.toolNameDelta === undefined) {
          return false
        }
        const next = appendBounded(
          activity.name,
          event.toolNameDelta,
          MAX_TOOL_NAME_BYTES,
        )
        const changed =
          next.value !== activity.name ||
          next.truncated !== activity.nameTruncated
        activity.name = next.value
        activity.nameTruncated = next.truncated
        return changed
      }
      case "tool_call_end": {
        const activity = this.#activityByCallId.get(event.toolCallId)
        if (activity === undefined || activity.state === "ready") return false
        activity.state = "ready"
        return true
      }
      case "finish":
        return this.setPhaseInternal("settling")
      case "error":
        return this.setPhaseInternal("failed")
      case "usage":
        return false
    }
  }

  private setPhaseInternal(phase: CodingLiveTurnPhase): boolean {
    if (this.#phase === phase) return false
    this.#phase = phase
    return true
  }

  private update(operation: () => boolean): boolean {
    const changed = operation()
    if (!changed) return false
    this.#revision += 1
    this.#updatedAt = Date.now()
    return true
  }
}

function sameReference(
  left: CodingTurnReference,
  right: Pick<ProviderRunEvent, "sessionId" | "inputId" | "turnId" | "jobId">,
): boolean {
  return left.sessionId === right.sessionId &&
    left.inputId === right.inputId &&
    left.turnId === right.turnId &&
    left.jobId === right.jobId
}

function appendBounded(
  current: string,
  delta: string,
  limitBytes: number,
): { readonly value: string; readonly truncated: boolean } {
  const available = limitBytes - byteLength(current)
  if (available <= 0) return { value: current, truncated: true }
  const bounded = prefixByBytes(delta, available)
  return {
    value: current + bounded.value,
    truncated: bounded.truncated,
  }
}

function prefixByBytes(
  value: string,
  limitBytes: number,
): { readonly value: string; readonly truncated: boolean } {
  if (byteLength(value) <= limitBytes) {
    return { value, truncated: false }
  }
  let result = ""
  for (const character of value) {
    if (byteLength(result + character) > limitBytes) break
    result += character
  }
  return { value: result, truncated: true }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8")
}
