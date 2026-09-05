import { randomUUID } from "node:crypto"
import type {
  TeamDeliveryMaterializationContext
} from "@wanex/protocol"
import {
  WanexJobRuntime,
  type RuntimeWorkerLoop
} from "@wanex/runtime/jobs"
import type { PreparedSessionTurnExecutionBinding } from "@wanex/runtime/host"
import type { CoreStore } from "@wanex/storage"
import {
  createTeamDeliveryOutcomeWorkerHandler,
  createTeamDeliveryWorkerHandler,
} from "./worker.js"
import type { TeamConversationStorage } from "./storage.js"

export interface TeamConversationExecutionHostOptions {
  readonly storage: CoreStore
  readonly teamStorage: TeamConversationStorage
  readonly workerCount?: number
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  prepareExecutionBinding(request: {
    readonly plan: TeamDeliveryMaterializationContext["childPlan"]
    readonly content: TeamDeliveryMaterializationContext["message"]["content"]
    readonly origin: TeamDeliveryMaterializationContext["childPlan"]["origin"]
  }): Promise<PreparedSessionTurnExecutionBinding>
  readonly wakeAgentHost?: () => void
  /** Best-effort notification after a durable Team delivery state commits. */
  readonly notifyTeamChanged?: (event: {
    readonly conversationId: string
    readonly deliveryId: string
    readonly cause: "delivery_changed" | "round_changed"
    readonly at: number
  }) => void
}

export interface TeamConversationExecutionHostStatus {
  readonly started: boolean
  readonly disposed: boolean
  readonly workerCount: number
}

const DEFAULT_TEAM_WORKER_COUNT = 1

export class TeamConversationExecutionHost {
  readonly #workers: WanexJobRuntime[]
  readonly #loops: RuntimeWorkerLoop[] = []
  readonly #options: TeamConversationExecutionHostOptions
  #started = false
  #disposed = false
  #stopPromise: Promise<void> | undefined
  #disposePromise: Promise<void> | undefined

  constructor(options: TeamConversationExecutionHostOptions) {
    const workerCount = options.workerCount ?? DEFAULT_TEAM_WORKER_COUNT
    if (!Number.isInteger(workerCount) || workerCount <= 0) {
      throw new Error("Team execution workerCount must be a positive integer")
    }
    this.#options = options
    const workerInstanceId = randomUUID()
    this.#workers = Array.from({ length: workerCount }, (_, index) => {
      const runtime = new WanexJobRuntime({
        storage: options.storage,
        workerId: `team_execution_worker_${workerInstanceId}_${index}`,
        kinds: ["team.delivery", "team.delivery.outcome"],
        ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
        ...(options.heartbeatIntervalMs === undefined
          ? {}
          : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
      })
      const deliveryHandler = createTeamDeliveryWorkerHandler({
        storage: options.teamStorage,
        turnStorage: options.storage,
        resolveExecutionBinding: async ({ context }) => ({
          prepared: await options.prepareExecutionBinding({
            plan: context.childPlan,
            content: context.message.content,
            origin: context.childPlan.origin
          })
        })
      })
      runtime.worker.register("team.delivery", async (context) => {
        const result = await deliveryHandler(context)
        this.notifyAgentHost()
        this.notifyTeamChanged(context.job.payload, "delivery_changed")
        return result
      })
      const outcomeHandler = createTeamDeliveryOutcomeWorkerHandler({
        storage: options.teamStorage
      })
      runtime.worker.register("team.delivery.outcome", async (context) => {
        const result = await outcomeHandler(context)
        this.notifyTeamChanged(context.job.payload, "round_changed")
        return result
      })
      return runtime
    })
  }

  status(): TeamConversationExecutionHostStatus {
    return {
      started: this.#started,
      disposed: this.#disposed,
      workerCount: this.#workers.length
    }
  }

  start(): void {
    if (this.#disposed) throw new Error("Team execution host is disposed")
    if (this.#stopPromise !== undefined) {
      throw new Error("Team execution host is stopping")
    }
    if (this.#started) return
    this.#started = true
    for (const worker of this.#workers) {
      this.#loops.push(worker.startWorkerLoop())
    }
  }

  wake(): void {
    if (!this.#started || this.#disposed) return
    for (const loop of this.#loops) loop.wake()
  }

  async runOnce(): Promise<readonly Awaited<ReturnType<WanexJobRuntime["runWorkerOnce"]>>[]> {
    if (this.#disposed) throw new Error("Team execution host is disposed")
    if (this.#stopPromise !== undefined) {
      throw new Error("Team execution host is stopping")
    }
    if (this.#started) {
      throw new Error("Team execution host is already running")
    }
    return await Promise.all(
      this.#workers.map(async (worker) => await worker.runWorkerOnce())
    )
  }

  async stop(): Promise<void> {
    if (this.#stopPromise !== undefined) return await this.#stopPromise
    this.#started = false
    const stopping = Promise.all(
      this.#workers.map(async (worker) => await worker.stop())
    ).then(() => undefined)
    this.#stopPromise = stopping
    try {
      await stopping
    } finally {
      if (this.#stopPromise === stopping) this.#stopPromise = undefined
      this.#loops.length = 0
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return await this.#disposePromise
    this.#disposed = true
    const disposing = this.stop()
    this.#disposePromise = disposing
    return await disposing
  }

  notifyAgentHost(): void {
    try {
      this.#options.wakeAgentHost?.()
    } catch {
      // Wake is an optimization; durable scheduler recovery remains authoritative.
    }
  }

  private notifyTeamChanged(
    payload: unknown,
    cause: "delivery_changed" | "round_changed"
  ): void {
    try {
      this.#options.notifyTeamChanged?.({
        conversationId: conversationIdFromPayload(payload),
        deliveryId: deliveryIdFromPayload(payload),
        cause,
        at: Date.now()
      })
    } catch {
      // Notification is advisory; durable Team state is already committed.
    }
  }
}

function deliveryIdFromPayload(payload: unknown): string {
  return requiredPayloadString(payload, "teamDeliveryId")
}

function conversationIdFromPayload(payload: unknown): string {
  return requiredPayloadString(payload, "teamConversationId")
}

function requiredPayloadString(payload: unknown, field: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Team execution job payload must be an object")
  }
  const value = (payload as Record<string, unknown>)[field]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Team execution job payload ${field} must be a non-empty string`)
  }
  return value
}

export function createTeamConversationExecutionHost(
  options: TeamConversationExecutionHostOptions
): TeamConversationExecutionHost {
  return new TeamConversationExecutionHost(options)
}
