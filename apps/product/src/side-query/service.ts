import { randomUUID } from "node:crypto"
import {
  projectBackendSafeError,
  type BackendShell
} from "@wanex/product/backend"
import {
  providerNotReadyError,
  projectProviderReadiness
} from "../provider/readiness.js"
import {
  selectedSessionId,
  type MutableState
} from "../state/product.js"
import type {
  CancelSideQueryRequest,
  DismissSideQueryRequest,
  DismissSideQueryResult,
  ReadSideQueryRequest,
  ReadSideQueryResult,
  SideQueryEvents,
  SideQueryInvalidationCause,
  SideQueryReadModel,
  StartSideQueryRequest
} from "./model.js"

const MAX_QUESTION_CHARACTERS = 16_384
const MAX_OUTPUT_TOKENS = 4_096
const MAX_ANSWER_CHARACTERS = 32_768
const MAX_ERROR_CHARACTERS = 2_048

type SideQueryBackend = {
  readonly commands: Pick<
    BackendShell["commands"],
    "askSideQuery" | "readSession" | "listModelEndpoints"
  >
}

interface RetainedSideQuery {
  readonly controller: AbortController
  model: SideQueryReadModel
  task?: Promise<void>
}

export interface SideQueryCoordinator {
  readonly events: SideQueryEvents
  start(
    request: StartSideQueryRequest
  ): Promise<SideQueryReadModel>
  read(request: ReadSideQueryRequest): ReadSideQueryResult
  cancel(
    request: CancelSideQueryRequest
  ): Promise<SideQueryReadModel>
  dismiss(
    request: DismissSideQueryRequest
  ): Promise<DismissSideQueryResult>
  dispose(): Promise<void>
}

export function createSideQueryCoordinator(request: {
  readonly backend: SideQueryBackend
  readonly state: Pick<MutableState, "selection">
  readonly now?: () => number
  readonly createQueryId?: () => string
}): SideQueryCoordinator {
  const now = request.now ?? Date.now
  const createQueryId = request.createQueryId ?? (() => `sideq_${randomUUID()}`)
  let current: RetainedSideQuery | undefined
  let disposed = false
  let tail: Promise<void> = Promise.resolve()
  let eventSequence = 0
  const listeners = new Set<
    Parameters<SideQueryEvents["subscribeSideQueryEvents"]>[0]
  >()

  function emit(
    queryId: string,
    cause: SideQueryInvalidationCause
  ): void {
    if (disposed) return
    eventSequence += 1
    const event = {
      kind: "product.side-query.invalidated" as const,
      sequence: eventSequence,
      at: now(),
      queryId,
      cause
    }
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // One presentation listener cannot block another listener.
      }
    }
  }

  function serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = tail.then(run, run)
    tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async function execute(
    retained: RetainedSideQuery,
    maxOutputTokens: number | undefined
  ): Promise<void> {
    try {
      const result = await request.backend.commands.askSideQuery({
        sessionId: retained.model.sessionId,
        question: retained.model.question,
        expectedModelEndpointId: retained.model.modelEndpointId,
        signal: retained.controller.signal,
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens })
      })
      if (result.modelEndpointId !== retained.model.modelEndpointId) {
        throw new Error("side query Provider binding changed during admission")
      }
      settleRunning(retained, () => {
        const answer = boundedText(result.answerText, MAX_ANSWER_CHARACTERS)
        const finishedAt = now()
        return {
          ...retained.model,
          state: "succeeded",
          answerText: answer.text,
          ...(answer.truncated ? { answerTruncated: true } : {}),
          updatedAt: finishedAt,
          finishedAt
        }
      })
    } catch (error) {
      settleRunning(retained, () => {
        const projected = projectBackendSafeError(error)
        const finishedAt = now()
        return {
          ...retained.model,
          state: "failed",
          error: {
            ...projected,
            message: boundedText(projected.message, MAX_ERROR_CHARACTERS).text
          },
          updatedAt: finishedAt,
          finishedAt
        }
      })
    }
  }

  function settleRunning(
    retained: RetainedSideQuery,
    settle: () => SideQueryReadModel
  ): void {
    if (current !== retained || retained.model.state !== "running") {
      return
    }
    retained.model = settle()
    emit(
      retained.model.queryId,
      retained.model.state === "succeeded" ? "succeeded" : "failed"
    )
  }

  return {
    events: {
      subscribeSideQueryEvents(listener) {
        if (disposed) return () => {}
        listeners.add(listener)
        let subscribed = true
        return () => {
          if (!subscribed) return
          subscribed = false
          listeners.delete(listener)
        }
      }
    },
    async start(input) {
      return await serialize(async () => {
        assertActive(disposed)
        if (current?.model.state === "running") {
          throw new Error("a side query is already running")
        }
        const question = normalizeQuestion(input.question)
        const maxOutputTokens = normalizeMaxOutputTokens(input.maxOutputTokens)
        const sessionId = selectedSessionId(request.state)
        if (sessionId === undefined) {
          throw new Error(
            "select an active session before starting a side query"
          )
        }
        const [session, endpointList] = await Promise.all([
          request.backend.commands.readSession({ sessionId }),
          request.backend.commands.listModelEndpoints()
        ])
        if (session.kind === "wanex-app.session.missing") {
          throw new Error(
            `selected side query session does not exist: ${sessionId}`
          )
        }
        if (session.session.status !== "active") {
          throw new Error(
            `selected side query session is archived: ${sessionId}`
          )
        }
        const readiness = projectProviderReadiness(endpointList)
        if (!readiness.canRun || readiness.activeEndpoint === undefined) {
          throw new Error(providerNotReadyError(readiness).message)
        }

        if (current !== undefined) {
          emit(current.model.queryId, "dismissed")
        }

        const startedAt = now()
        const retained: RetainedSideQuery = {
          controller: new AbortController(),
          model: {
            kind: "product.side-query",
            queryId: createQueryId(),
            sessionId,
            modelEndpointId: readiness.activeEndpoint.id,
            state: "running",
            question,
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            startedAt,
            updatedAt: startedAt
          }
        }
        current = retained
        emit(retained.model.queryId, "started")
        retained.task = Promise.resolve().then(
          async () => await execute(retained, maxOutputTokens)
        )
        return copyReadModel(retained.model)
      })
    },
    read(input) {
      const queryId = normalizeQueryId(input.queryId)
      if (current === undefined || current.model.queryId !== queryId) {
        return {
          kind: "product.side-query.missing",
          queryId
        }
      }
      return {
        kind: "product.side-query.found",
        query: copyReadModel(current.model)
      }
    },
    async cancel(input) {
      return await serialize(async () => {
        assertActive(disposed)
        const retained = requireCurrent(current, input.queryId)
        if (retained.model.state !== "running") {
          throw new Error(
            `side query is not running: ${retained.model.queryId}`
          )
        }
        const finishedAt = now()
        retained.model = {
          ...retained.model,
          state: "cancelled",
          updatedAt: finishedAt,
          finishedAt
        }
        emit(retained.model.queryId, "cancelled")
        retained.controller.abort()
        await retained.task
        return copyReadModel(retained.model)
      })
    },
    async dismiss(input) {
      return await serialize(async () => {
        assertActive(disposed)
        const retained = requireCurrent(current, input.queryId)
        if (retained.model.state === "running") {
          throw new Error(
            `cannot dismiss a running side query: ${retained.model.queryId}`
          )
        }
        emit(retained.model.queryId, "dismissed")
        current = undefined
        return {
          kind: "product.side-query.dismissed",
          queryId: retained.model.queryId
        }
      })
    },
    async dispose() {
      await serialize(async () => {
        if (disposed) return
        disposed = true
        if (current === undefined) {
          listeners.clear()
          return
        }
        if (current.model.state !== "running") {
          current = undefined
          listeners.clear()
          return
        }
        const retained = current
        const finishedAt = now()
        retained.model = {
          ...retained.model,
          state: "cancelled",
          updatedAt: finishedAt,
          finishedAt
        }
        emit(retained.model.queryId, "cancelled")
        retained.controller.abort()
        await retained.task
        current = undefined
        listeners.clear()
      })
    }
  }
}

function normalizeQuestion(value: string): string {
  const question = value.trim()
  if (question.length === 0) {
    throw new Error("side query question must not be empty")
  }
  if (question.length > MAX_QUESTION_CHARACTERS) {
    throw new Error(
      `side query question must not exceed ${MAX_QUESTION_CHARACTERS} characters`
    )
  }
  return question
}

function normalizeMaxOutputTokens(
  value: number | undefined
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value <= 0 || value > MAX_OUTPUT_TOKENS) {
    throw new Error(
      `side query maxOutputTokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS}`
    )
  }
  return value
}

function normalizeQueryId(value: string): string {
  const queryId = value.trim()
  if (queryId.length === 0) {
    throw new Error("side query queryId must not be empty")
  }
  return queryId
}

function requireCurrent(
  current: RetainedSideQuery | undefined,
  queryId: string
): RetainedSideQuery {
  const normalized = normalizeQueryId(queryId)
  if (current === undefined || current.model.queryId !== normalized) {
    throw new Error(`side query does not exist: ${normalized}`)
  }
  return current
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("side query coordinator is disposed")
  }
}

function boundedText(
  value: string,
  maxCharacters: number
): { readonly text: string; readonly truncated: boolean } {
  if (value.length <= maxCharacters) {
    return { text: value, truncated: false }
  }
  return {
    text: value.slice(0, maxCharacters),
    truncated: true
  }
}

function copyReadModel(
  model: SideQueryReadModel
): SideQueryReadModel {
  return {
    ...model,
    ...(model.error === undefined ? {} : { error: { ...model.error } })
  }
}
