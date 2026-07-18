import { randomUUID } from "node:crypto"
import type {
  JsonValue,
  SchedulerJobRecord,
  SessionInputRecord
} from "@wanex/protocol"
import type { BootstrappedWanexAppShellRuntime } from "./runtime.js"
import type {
  WanexAppShellQueueGuidedFollowUpRequest,
  WanexAppShellQueueGuidedFollowUpResult
} from "./types-workflow.js"
import {
  defaultPrincipalId,
  normalizeOptionalRef
} from "./workflow-shared.js"

const defaultGuidedFollowUpSourceRef = "guided-follow-up"

export async function queueWanexAppShellGuidedFollowUp(
  runtime: BootstrappedWanexAppShellRuntime,
  options: {
    readonly request: WanexAppShellQueueGuidedFollowUpRequest
    readonly providerProfileId: string
  }
): Promise<WanexAppShellQueueGuidedFollowUpResult> {
  const text = options.request.text.trim()
  if (text.length === 0) {
    throw new Error("guided follow-up text must not be empty")
  }
  const activeRunId = options.request.activeRunId.trim()
  if (activeRunId.length === 0) {
    throw new Error("guided follow-up activeRunId must not be empty")
  }
  const session = await runtime.storage.getSession(options.request.sessionId)
  if (session === null) {
    throw new Error(
      `guided follow-up session not found: ${options.request.sessionId}`
    )
  }

  const inputId = options.request.inputId ?? `inp_${randomUUID()}`
  const sourceRef =
    normalizeOptionalRef(options.request.sourceRef) ??
    defaultGuidedFollowUpSourceRef
  const providerProfileId = options.providerProfileId
  const receipt = await runtime.storage.submitSessionRun({
    id: inputId,
    sessionId: options.request.sessionId,
    principalId: options.request.principalId ?? defaultPrincipalId,
    idempotencyKey:
      options.request.idempotencyKey ??
      `app-shell-guided:${options.request.sessionId}:${inputId}`,
    content: [
      {
        type: "text",
        id: "guided_follow_up_text",
        text
      }
    ],
    origin: {
      kind: "interactive",
      sourceRef,
      parentRef: activeRunId,
      metadata: {
        productPolicy: "queue_after_current"
      }
    },
    intent: "follow_up",
    runControlPolicy: "queue_after_current",
    expectedRunId: activeRunId,
    providerProfileId,
    mode: "once",
    maxSteps: 1,
    ...(options.request.jobId === undefined
      ? {}
      : { jobId: options.request.jobId }),
    ...(options.request.jobIdempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: options.request.jobIdempotencyKey })
  })
  const inputs = await runtime.storage.listSessionInputs({
    sessionId: options.request.sessionId
  })
  const input = inputs.find((item) => item.id === receipt.admission.inputId)
  if (input === undefined) {
    throw new Error(
      `guided follow-up input was not readable: ${receipt.admission.inputId}`
    )
  }

  return {
    sessionId: options.request.sessionId,
    activeRunId,
    providerProfileId,
    input: projectQueuedInput(input),
    job: projectQueuedJob(receipt.job),
    receipt
  }
}

function projectQueuedInput(
  input: SessionInputRecord
): WanexAppShellQueueGuidedFollowUpResult["input"] {
  if (
    input.origin?.kind !== "interactive" ||
    input.origin.sourceRef === undefined ||
    input.origin.parentRef === undefined ||
    input.intent !== "follow_up" ||
    input.runControlPolicy !== "queue_after_current" ||
    input.expectedRunId === undefined
  ) {
    throw new Error("guided follow-up input did not persist required provenance")
  }
  return {
    inputId: input.id,
    status: "admitted",
    intent: "follow_up",
    originKind: "interactive",
    sourceRef: input.origin.sourceRef,
    parentRef: input.origin.parentRef,
    runControlPolicy: "queue_after_current",
    expectedRunId: input.expectedRunId
  }
}

function projectQueuedJob(
  job: SchedulerJobRecord
): WanexAppShellQueueGuidedFollowUpResult["job"] {
  const providerProfileId = providerProfileIdFromPayload(job.payload)
  if (job.kind !== "session.run") {
    throw new Error(
      `guided follow-up job kind must be session.run, got ${job.kind}`
    )
  }
  return {
    jobId: job.id,
    kind: "session.run",
    state: job.state,
    providerProfileId
  }
}

function providerProfileIdFromPayload(payload: JsonValue): string {
  if (!isJsonObject(payload)) {
    throw new Error("guided follow-up job payload must be an object")
  }
  const providerProfileId = payload.providerProfileId
  if (typeof providerProfileId !== "string" || providerProfileId.length === 0) {
    throw new Error("guided follow-up job payload must include providerProfileId")
  }
  return providerProfileId
}

function isJsonObject(
  value: JsonValue
): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
