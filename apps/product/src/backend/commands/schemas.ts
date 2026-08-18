import type { AppCommandInputSchema } from "@wanex/extension"
import { BACKEND_HANDLER_REFS, type BackendHandlerRef } from "./handlers.js"

const identifier = (title: string) => ({
  type: "string" as const,
  title,
  minLength: 1,
  maxLength: 512
})

const timestamp = {
  type: "number",
  title: "Generated at",
  description: "Optional Unix timestamp in milliseconds."
} as const

const boundedLimit = (title: string, maximum: number, minimum = 1) => ({
  type: "integer" as const,
  title,
  minimum,
  maximum
})

export const BACKEND_COMMAND_INPUT_SCHEMAS = {
  [BACKEND_HANDLER_REFS.submitConversationOperation]: {
    type: "object",
    title: "Agent turn",
    properties: {
      text: {
        type: "string",
        title: "Message",
        minLength: 1,
        maxLength: 65_536
      },
      sessionId: identifier("Session ID"),
      principalId: identifier("Principal ID"),
      inputId: identifier("Input ID"),
      idempotencyKey: identifier("Idempotency key"),
      jobId: identifier("Job ID"),
      expectedTurnId: identifier("Expected turn ID"),
      regeneratesTurnId: identifier("Regenerated turn ID")
    },
    required: ["text"],
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.status]: undefined,
  [BACKEND_HANDLER_REFS.readProductOverview]: {
    type: "object",
    title: "Overview options",
    properties: {
      now: timestamp,
      recentSessionLimit: boundedLimit("Recent session limit", 100)
    },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readDiagnostics]: {
    type: "object",
    title: "Diagnostics options",
    properties: { now: timestamp },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readProductDiagnosticsDetail]: {
    type: "object",
    title: "Diagnostics detail options",
    properties: {
      now: timestamp,
      diagnosticLimit: boundedLimit("Diagnostic limit", 200, 0),
      activityLimit: boundedLimit("Activity limit", 200, 0)
    },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.buildSupportBundle]: {
    type: "object",
    title: "Support bundle options",
    properties: {
      now: timestamp,
      eventLimit: boundedLimit("Event limit", 1_000),
      jobLimit: boundedLimit("Job limit", 1_000)
    },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readRecentSessions]: {
    type: "object",
    title: "Recent session options",
    properties: { limit: boundedLimit("Session limit", 100) },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readProductWorkbench]: {
    type: "object",
    title: "Workbench session",
    properties: { sessionId: identifier("Session ID") },
    required: ["sessionId"],
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readSessionInputProvenance]: {
    type: "object",
    title: "Session provenance",
    properties: { sessionId: identifier("Session ID") },
    required: ["sessionId"],
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.readSessionTranscript]: {
    type: "object",
    title: "Session transcript",
    properties: {
      sessionId: identifier("Session ID"),
      beforeSequence: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 }
    },
    required: ["sessionId"],
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.refreshAgentContextProfile]: undefined,
  [BACKEND_HANDLER_REFS.startAgentContextMonitor]: {
    type: "object",
    title: "Context monitor options",
    properties: {
      intervalMs: boundedLimit("Refresh interval (ms)", 86_400_000, 100)
    },
    additionalProperties: false
  },
  [BACKEND_HANDLER_REFS.stopAgentContextMonitor]: undefined,
  [BACKEND_HANDLER_REFS.shutdown]: undefined
} as const satisfies Readonly<
  Record<BackendHandlerRef, AppCommandInputSchema | undefined>
>
