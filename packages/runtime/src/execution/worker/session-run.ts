import { randomUUID } from "node:crypto"
import { WanexAgentRunner } from "../core/index.js"
import { resolveProviderProfile } from "../../provider/index.js"
import type { JsonValue, RuntimeAbortSignal } from "@wanex/protocol"
import type { WorkerHandler } from "../../jobs/index.js"
import type {
  ProfileSessionRunHandlerOptions,
  RegisterSessionRunHandlerOptions,
  RegisterProfileSessionRunHandlerOptions,
  SessionRunHandlerOptions,
  SessionRunJobPayload,
  SessionRunMode,
  SessionRunReceipt
} from "./types.js"

export function createSessionRunHandler(
  options: SessionRunHandlerOptions
): WorkerHandler {
  return async ({ job, signal }) => {
    if (signal.aborted) {
      throw new Error(`session.run job aborted before start: ${job.id}`)
    }

    const payload = parseSessionRunPayload(job.payload)
    return await runSessionPayload(payload, options, signal, job.budgetGrantId)
  }
}

export function createProfileSessionRunHandler(
  options: ProfileSessionRunHandlerOptions
): WorkerHandler {
  return async ({ job, signal }) => {
    if (signal.aborted) {
      throw new Error(`session.run job aborted before start: ${job.id}`)
    }

    const payload = parseSessionRunPayload(job.payload)
    const providerProfileId =
      options.providerProfileId ?? payload.providerProfileId
    if (providerProfileId === undefined || providerProfileId.length === 0) {
      throw new Error("session.run requires providerProfileId")
    }
    const provider = await resolveProviderProfile(
      options.storage,
      providerProfileId
    )
    return await runSessionPayload(payload, {
      ...options,
      provider
    }, signal, job.budgetGrantId)
  }
}

export function registerSessionRunHandler(
  options: RegisterSessionRunHandlerOptions
): void {
  options.worker.register("session.run", createSessionRunHandler(options))
}

export function registerProfileSessionRunHandler(
  options: RegisterProfileSessionRunHandlerOptions
): void {
  options.worker.register(
    "session.run",
    createProfileSessionRunHandler(options)
  )
}

function parseSessionRunPayload(payload: JsonValue): SessionRunJobPayload {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("session.run payload must be an object")
  }
  const record = payload as Record<string, JsonValue>
  const sessionId = expectString(record.sessionId, "session.run.sessionId")
  const mode =
    record.mode === undefined
      ? undefined
      : expectSessionRunMode(record.mode, "session.run.mode")
  const maxSteps =
    record.maxSteps === undefined
      ? undefined
      : expectPositiveNumber(record.maxSteps, "session.run.maxSteps")
  const providerProfileId =
    record.providerProfileId === undefined
      ? undefined
      : expectString(record.providerProfileId, "session.run.providerProfileId")

  return {
    sessionId,
    ...(mode === undefined ? {} : { mode }),
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(providerProfileId === undefined ? {} : { providerProfileId })
  }
}

function expectString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function expectSessionRunMode(
  value: JsonValue,
  label: string
): SessionRunMode {
  if (value !== "once" && value !== "to_completion") {
    throw new Error(`${label} must be once or to_completion`)
  }
  return value
}

function expectPositiveNumber(value: JsonValue, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
  return Math.trunc(value)
}

function receiptToJson(receipt: SessionRunReceipt): JsonValue {
  return receipt as unknown as JsonValue
}

async function runSessionPayload(
  payload: SessionRunJobPayload,
  options: SessionRunHandlerOptions,
  signal: RuntimeAbortSignal,
  budgetGrantId: string | undefined
): Promise<JsonValue> {
  const runner = new WanexAgentRunner({
    session: options.session,
    provider: options.provider,
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.toolPermissionPolicy }),
    ...(options.toolRecoveryPolicy === undefined
      ? {}
      : { toolRecoveryPolicy: options.toolRecoveryPolicy }),
    ...(options.toolMaxConcurrency === undefined
      ? {}
      : { toolMaxConcurrency: options.toolMaxConcurrency }),
    ...(options.contextCompiler === undefined
      ? {}
      : { contextCompiler: options.contextCompiler }),
    runnerId: options.runnerId ?? `agent_worker_${randomUUID()}`,
    leaseMs: options.leaseMs,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.observeProviderEvent === undefined
      ? {}
      : { observeProviderEvent: options.observeProviderEvent })
  })

  if ((payload.mode ?? "once") === "to_completion") {
    const result = await runner.runToCompletion({
      sessionId: payload.sessionId,
      ...(payload.maxSteps === undefined ? {} : { maxSteps: payload.maxSteps }),
      signal,
      ...(budgetGrantId === undefined ? {} : { budgetGrantId })
    })
    return receiptToJson({
      sessionId: result.sessionId,
      status: result.status,
      mode: "to_completion",
      ...(result.status === "completed" || result.status === "cancelled"
        ? {
            inputId: result.inputId,
            runId: result.runId,
            steps: result.steps,
            ...(result.status === "cancelled" && result.reason !== undefined
              ? { reason: result.reason }
              : {})
          }
        : { steps: result.steps })
    })
  }

  const result = await runner.runOnce({
    sessionId: payload.sessionId,
    signal,
    ...(budgetGrantId === undefined ? {} : { budgetGrantId })
  })
  return receiptToJson({
    sessionId: result.sessionId,
    status: result.status,
    mode: "once",
    ...(result.status === "completed" || result.status === "cancelled"
      ? {
          inputId: result.inputId,
          runId: result.runId,
          ...(result.status === "cancelled" && result.reason !== undefined
            ? { reason: result.reason }
            : {})
        }
      : {})
  })
}
