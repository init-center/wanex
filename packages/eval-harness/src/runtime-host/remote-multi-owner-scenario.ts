import { join } from "node:path"
import {
  createRemoteStorageControlPlane,
  createStorageWireTransportPool
} from "@wanex/storage-control-plane"
import {
  PersistentSystemServiceStorageWireTransport
} from "@wanex/storage"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import type {
  JsonValue,
  MessagePart,
  TextMessagePart
} from "@wanex/protocol"
import { startEvalRemoteStorageServer } from "../eval-remote-storage-server.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

const sessionCount = 32
const workersPerHost = 4
const combinedWorkerCount = workersPerHost * 2

type SubmittedTurn = Awaited<
  ReturnType<WanexRuntimeHost["submitUserTurn"]>
>

interface ExpectedTurn {
  readonly submitted: SubmittedTurn
  readonly label: string
  readonly assistant: boolean
}

export const runtimeHostRemoteMultiOwnerScenario = createEvalScenario({
  id: "runtime-host.remote-multi-owner",
  title: "Independent Runtime hosts coordinate through one remote store",
  tags: ["worker", "storage", "remote", "multi-agent", "cancellation"],
  async run(context) {
    type RuntimeHostSubject = {
      readonly subjectId: "runtime-host-shared"
    }
    const createdTransports: string[] = []
    const pool = createStorageWireTransportPool<RuntimeHostSubject>({
      createTransport(subject) {
        createdTransports.push(subject.subjectId)
        return new PersistentSystemServiceStorageWireTransport({
          storeDir: join(
            context.storeDir,
            "remote-runtime-multi-owner",
            subject.subjectId
          ),
          serviceBin: context.serviceBin
        })
      }
    })
    const controlPlane = createRemoteStorageControlPlane<RuntimeHostSubject>({
      async authenticateBearerToken(token) {
        return token === "runtime-host-shared-token"
          ? { subjectId: "runtime-host-shared" }
          : null
      },
      resolveStorageWireTransport: pool.resolveStorageWireTransport
    })
    const server = await startEvalRemoteStorageServer(controlPlane.handle)
    const coordinator = new MultiOwnerProviderCoordinator()
    const storageConfig = {
      kind: "remote-http" as const,
      endpoint: server.endpoint,
      token: "runtime-host-shared-token",
      timeoutMs: 10_000
    }
    const hostA = new WanexRuntimeHost({
      storageConfig,
      workerCount: workersPerHost,
      heartbeatIntervalMs: 20,
      provider: new MultiOwnerProbeProvider("host-a", coordinator)
    })
    const hostB = new WanexRuntimeHost({
      storageConfig,
      workerCount: workersPerHost,
      heartbeatIntervalMs: 20,
      provider: new MultiOwnerProbeProvider("host-b", coordinator)
    })
    const expectedTurns: ExpectedTurn[] = []

    try {
      for (let index = 0; index < sessionCount; index += 1) {
        const label = `parallel-${String(index).padStart(2, "0")}`
        const submitted = await (index % 2 === 0 ? hostA : hostB).submitUserTurn({
          content: [{ type: "text", text: label }],
          sessionId: `ses_eval_remote_parallel_${String(index).padStart(2, "0")}`
        })
        expectedTurns.push({ submitted, label, assistant: true })
      }

      for (let wave = 0; wave < sessionCount / combinedWorkerCount; wave += 1) {
        const gate = coordinator.armGate(combinedWorkerCount)
        const running = Promise.all([hostA.runOnce(), hostB.runOnce()])
        await withDeadline(gate.ready, `parallel wave ${wave} did not fill all workers`)
        assert(
          coordinator.active === combinedWorkerCount,
          `parallel wave should have ${combinedWorkerCount} active providers`
        )
        gate.release()
        const results = await running
        assertStatuses(results, combinedWorkerCount, 0, `parallel wave ${wave}`)
      }
      assert(
        coordinator.maxActive === combinedWorkerCount,
        "different sessions should overlap across all eight worker slots"
      )
      assert(
        coordinator.ownerDispatchCount("host-a") > 0 &&
          coordinator.ownerDispatchCount("host-b") > 0,
        "both independent Runtime hosts should dispatch provider work"
      )

      const sameSessionFirst = await hostA.submitUserTurn({
        content: [{ type: "text", text: "same-session-first" }],
        sessionId: "ses_eval_remote_same_session"
      })
      const sameSessionSecond = await hostB.submitUserTurn({
        content: [{ type: "text", text: "same-session-second" }],
        sessionId: "ses_eval_remote_same_session"
      })
      expectedTurns.push(
        { submitted: sameSessionFirst, label: "same-session-first", assistant: true },
        { submitted: sameSessionSecond, label: "same-session-second", assistant: true }
      )
      for (const label of ["first", "second"]) {
        const gate = coordinator.armGate(1)
        const running = Promise.all([hostA.runOnce(), hostB.runOnce()])
        await withDeadline(gate.ready, `same-session ${label} turn did not start`)
        gate.release()
        const results = await running
        assertStatuses(results, 1, combinedWorkerCount - 1, `same-session ${label}`)
      }
      assert(
        coordinator.sameSessionMaxActive === 1,
        "one session must never execute two turns concurrently across hosts"
      )

      const cancelled = await hostA.submitUserTurn({
        content: [{ type: "text", text: "remote-cancel" }],
        sessionId: "ses_eval_remote_cancel"
      })
      expectedTurns.push({ submitted: cancelled, label: "remote-cancel", assistant: false })
      const cancellationRun = hostA.runOnce()
      await withDeadline(
        coordinator.cancellationStarted.promise,
        "remote cancellation provider did not start"
      )
      const cancellation = await hostB.requestSessionTurnCancel({
        sessionId: cancelled.session.id,
        turnId: cancelled.turnId,
        inputId: cancelled.inputId,
        jobId: cancelled.receipt.job.id,
        reason: "remote owner requested cancellation"
      })
      assert(
        cancellation.status === "cancel_requested",
        `remote cancellation should be requested, received ${cancellation.status}`
      )
      await withDeadline(
        coordinator.cancellationAborted.promise,
        "remote cancellation did not abort the active provider"
      )
      await cancellationRun
      assert(
        coordinator.cancellationAbortCount === 1,
        "remote cancellation should abort exactly one provider request"
      )

      expectedTurns.push(await submitAndRunReusable(
        hostA,
        "host-a-after-cancel",
        "ses_eval_host_a_after_cancel"
      ))
      expectedTurns.push(await submitAndRunReusable(
        hostB,
        "host-b-after-cancel",
        "ses_eval_host_b_after_cancel"
      ))

      const plannedFailure = await hostA.submitUserTurn({
        content: [{ type: "text", text: "host-a-planned-failure" }],
        sessionId: "ses_eval_host_a_failure"
      })
      expectedTurns.push({
        submitted: plannedFailure,
        label: "host-a-planned-failure",
        assistant: false
      })
      const failureRun = await hostA.runOnce()
      assertStatuses([failureRun], 0, workersPerHost - 1, "host A failure", 1)

      expectedTurns.push(await submitAndRunReusable(
        hostB,
        "host-b-after-host-a-failure",
        "ses_eval_host_b_after_failure"
      ))
      expectedTurns.push(await submitAndRunReusable(
        hostA,
        "host-a-after-own-failure",
        "ses_eval_host_a_after_failure"
      ))

      const expectedDispatches = expectedTurns.length
      assert(
        expectedDispatches === 40,
        `scenario should dispatch exactly 40 turns, received ${expectedDispatches}`
      )
      assert(
        coordinator.dispatchCount === expectedDispatches,
        `provider dispatch count differs: ${coordinator.dispatchCount}`
      )
      assert(
        coordinator.duplicateDispatchLabels.length === 0,
        `provider labels dispatched more than once: ${coordinator.duplicateDispatchLabels.join(",")}`
      )
      await assertDurableTurnMessages(hostA, expectedTurns)

      const jobs = await hostA.listJobs({})
      const succeeded = jobs.filter((job) => job.state === "succeeded").length
      const cancelledJobs = jobs.filter((job) => job.state === "cancelled").length
      const failed = jobs.filter((job) => job.state === "failed").length
      assert(succeeded === 38, `expected 38 succeeded jobs, received ${succeeded}`)
      assert(cancelledJobs === 1, "remote cancellation should settle one job")
      assert(failed === 1, "planned provider failure should settle one failed job")
      assert(
        createdTransports.length === 1 &&
          createdTransports[0] === "runtime-host-shared",
        "one authenticated subject should resolve exactly one server-side transport"
      )
      return {
        hosts: 2,
        workers: combinedWorkerCount,
        sessions: new Set(expectedTurns.map((item) => item.submitted.session.id)).size,
        dispatches: coordinator.dispatchCount,
        maxActive: coordinator.maxActive,
        sameSessionMaxActive: coordinator.sameSessionMaxActive,
        cancellationAbortCount: coordinator.cancellationAbortCount,
        succeeded,
        cancelled: cancelledJobs,
        failed,
        createdTransports
      }
    } finally {
      await Promise.allSettled([hostA.dispose(), hostB.dispose()])
      await server.close()
      await pool.close()
    }
  }
})

async function submitAndRunReusable(
  host: WanexRuntimeHost,
  label: string,
  sessionId: string
): Promise<ExpectedTurn> {
  const submitted = await host.submitUserTurn({
    content: [{ type: "text", text: label }],
    sessionId
  })
  const result = await host.runOnce()
  assertStatuses([result], 1, workersPerHost - 1, label)
  return { submitted, label, assistant: true }
}

async function assertDurableTurnMessages(
  host: WanexRuntimeHost,
  expectedTurns: readonly ExpectedTurn[]
): Promise<void> {
  const bySession = new Map<string, ExpectedTurn[]>()
  for (const expected of expectedTurns) {
    const session = bySession.get(expected.submitted.session.id) ?? []
    session.push(expected)
    bySession.set(expected.submitted.session.id, session)
  }
  for (const [sessionId, turns] of bySession) {
    const messages = await host.storage.listSessionMessages({ sessionId })
    for (const expected of turns) {
      const turnMessages = messages.filter(
        (message) => message.turnId === expected.submitted.turnId
      )
      const assistants = turnMessages.filter((message) => message.role === "assistant")
      assert(
        assistants.length === (expected.assistant ? 1 : 0),
        `turn ${expected.submitted.turnId} assistant settlement differs`
      )
      if (expected.assistant) {
        assert(
          textFromParts(assistants[0]!.content) === `complete:${expected.label}`,
          `turn ${expected.submitted.turnId} assistant text differs`
        )
      }
    }
  }
}

function assertStatuses(
  results: readonly Awaited<ReturnType<WanexRuntimeHost["runOnce"]>>[],
  completed: number,
  idle: number,
  label: string,
  failed = 0
): void {
  const statuses = results.flatMap((result) =>
    result.results.map((item) => item.worker.status)
  )
  const count = (status: string) => statuses.filter((item) => item === status).length
  assert(count("completed") === completed, `${label} completed worker count differs`)
  assert(count("idle") === idle, `${label} idle worker count differs`)
  assert(count("failed") === failed, `${label} failed worker count differs`)
}

type HostOwner = "host-a" | "host-b"

class MultiOwnerProviderCoordinator {
  readonly cancellationStarted = deferred<void>()
  readonly cancellationAborted = deferred<void>()
  active = 0
  maxActive = 0
  sameSessionMaxActive = 0
  cancellationAbortCount = 0
  private sameSessionActive = 0
  private gate: ProviderGate | undefined
  private readonly dispatches = new Map<string, number>()
  private readonly ownerDispatches = new Map<HostOwner, number>()

  get dispatchCount(): number {
    return [...this.dispatches.values()].reduce((sum, count) => sum + count, 0)
  }

  get duplicateDispatchLabels(): string[] {
    return [...this.dispatches]
      .filter(([, count]) => count !== 1)
      .map(([label]) => label)
      .sort()
  }

  ownerDispatchCount(owner: HostOwner): number {
    return this.ownerDispatches.get(owner) ?? 0
  }

  armGate(expected: number): { readonly ready: Promise<void>; release(): void } {
    if (this.gate !== undefined) throw new Error("provider gate is already armed")
    const ready = deferred<void>()
    const released = deferred<void>()
    const gate: ProviderGate = { expected, entered: 0, ready, released }
    this.gate = gate
    return {
      ready: ready.promise,
      release: () => {
        if (this.gate !== gate || gate.entered !== expected) {
          throw new Error("provider gate released before its exact capacity")
        }
        this.gate = undefined
        released.resolve()
      }
    }
  }

  async enter(owner: HostOwner, label: string): Promise<() => void> {
    this.dispatches.set(label, (this.dispatches.get(label) ?? 0) + 1)
    this.ownerDispatches.set(owner, (this.ownerDispatches.get(owner) ?? 0) + 1)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    const sameSession = label.startsWith("same-session-")
    if (sameSession) {
      this.sameSessionActive += 1
      this.sameSessionMaxActive = Math.max(
        this.sameSessionMaxActive,
        this.sameSessionActive
      )
    }
    const gate = this.gate
    if (gate !== undefined) {
      gate.entered += 1
      if (gate.entered > gate.expected) {
        throw new Error("provider gate admitted too many executions")
      }
      if (gate.entered === gate.expected) gate.ready.resolve()
      await gate.released.promise
    }
    let left = false
    return () => {
      if (left) return
      left = true
      this.active -= 1
      if (sameSession) this.sameSessionActive -= 1
    }
  }
}

interface ProviderGate {
  readonly expected: number
  entered: number
  readonly ready: Deferred<void>
  readonly released: Deferred<void>
}

class MultiOwnerProbeProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "remote-multi-owner-probe"
  readonly modelId = "remote-multi-owner-probe-model"

  constructor(
    private readonly owner: HostOwner,
    private readonly coordinator: MultiOwnerProviderCoordinator
  ) {}

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const label = userText(request.messages)
    const leave = await this.coordinator.enter(this.owner, label)
    try {
      if (label === "remote-cancel") {
        this.coordinator.cancellationStarted.resolve()
        await waitForAbort(request.signal)
        this.coordinator.cancellationAbortCount += 1
        this.coordinator.cancellationAborted.resolve()
        yield {
          type: "error",
          error: {
            category: "aborted",
            message: "remote owner cancelled provider",
            retryable: false,
            providerId: this.providerId,
            modelId: this.modelId,
            phase: "request"
          }
        }
        return
      }
      if (label === "host-a-planned-failure" && this.owner === "host-a") {
        yield {
          type: "error",
          error: {
            category: "unknown",
            message: "planned host A provider failure",
            retryable: false,
            providerId: this.providerId,
            modelId: this.modelId,
            phase: "request"
          }
        }
        return
      }
      yield {
        type: "text_delta",
        partId: `text_${label.replaceAll(/\W+/g, "_")}`,
        delta: `complete:${label}`
      }
      yield { type: "finish", reason: "stop" }
    } finally {
      leave()
    }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    })) as JsonValue[]
  }
}

function userText(messages: ProviderRequest["messages"]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .at(-1) ?? ""
}

function textFromParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

async function waitForAbort(signal: ProviderRequest["signal"]): Promise<void> {
  if (signal === undefined) throw new Error("provider cancellation signal is missing")
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", resolve, { once: true })
  })
}

async function withDeadline<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 10_000)
      })
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
