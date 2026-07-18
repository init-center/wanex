import { describe, expect, it } from "vitest"
import type {
  JsonValue,
  ListJobsRequest,
  MessagePart,
  SchedulerJobRecord,
  SessionMessageRecord,
  SessionRecord,
  SubmitSessionRunReceipt,
  TextMessagePart
} from "@wanex/protocol"
import {
  delegationExecutorFromRuntimeHost,
  runtimeIdsForTask,
  DelegationRuntime,
  type DelegationExecutor,
  type DelegationPlan,
  type SubmitUserTextRequest,
  type SubmitUserTextResult
} from "../../src/delegation/index.js"

describe("@wanex/team/delegation", () => {
  it("submits and runs sub-agent tasks through the executor port", async () => {
    const executor = new InMemoryDelegationExecutor()
    const runtime = new DelegationRuntime({ executor })

    const result = await runtime.runDelegationOnce({
      id: "del_parallel",
      title: "Parallel delegation",
      tasks: [
        { id: "api", prompt: "api analysis" },
        { id: "tests", prompt: "test analysis" },
        { id: "docs", prompt: "doc analysis" }
      ]
    })

    expect(result.run.results.map((item) => item.worker.status)).toEqual([
      "completed",
      "completed",
      "completed"
    ])
    expect(executor.maxActive).toBe(3)
    expect(result.summary.status).toBe("succeeded")
    expect(result.summary.tasks).toHaveLength(3)
    expect(
      result.summary.tasks.map((task) => textFromParts(task.output)).sort()
    ).toEqual([
      "delegated: api analysis",
      "delegated: doc analysis",
      "delegated: test analysis"
    ])
    await expect(executor.listJobs({ state: "succeeded" })).resolves.toHaveLength(3)
  })

  it("adapts host-like executors without tying the package to runtime-host", async () => {
    const host = new InMemoryDelegationExecutor({
      responseText: () => "executor response"
    })
    const executor = delegationExecutorFromRuntimeHost({
      submitUserText: (request) => host.submitUserText(request),
      runOnce: () => host.runOnce(),
      listJobs: (request) => host.listJobs(request),
      storage: {
        listSessionMessages: (request) => host.listSessionMessages(request)
      }
    })
    const runtime = new DelegationRuntime({ executor })

    const result = await runtime.runDelegationOnce({
      id: "del_executor_port",
      tasks: [{ id: "one", prompt: "executor one" }]
    })

    expect(result.run.results).toHaveLength(1)
    expect(result.summary.status).toBe("succeeded")
    expect(textFromParts(result.summary.tasks[0]!.output)).toBe(
      "executor response"
    )
  })

  it("resubmits the same plan idempotently without duplicating jobs", async () => {
    const executor = new InMemoryDelegationExecutor({
      responseText: () => "idempotent response"
    })
    const runtime = new DelegationRuntime({ executor })
    const plan: DelegationPlan = {
      id: "del_idempotent",
      tasks: [
        { id: "one", prompt: "repeat one" },
        { id: "two", prompt: "repeat two" }
      ]
    }

    const first = await runtime.submitDelegation(plan)
    const second = await runtime.submitDelegation(plan)

    expect(second.tasks.map((task) => task.receipt.job.id)).toEqual(
      first.tasks.map((task) => task.receipt.job.id)
    )
    await expect(executor.listJobs({ kind: "session.run" })).resolves.toHaveLength(2)
    await executor.runOnce()
    const summary = await runtime.collectDelegation(plan.id)
    expect(summary.status).toBe("succeeded")
    await expect(executor.listJobs({ state: "succeeded" })).resolves.toHaveLength(2)
  })

  it("isolates failed sub-agent tasks from successful tasks", async () => {
    const executor = new InMemoryDelegationExecutor({
      failWhenText: "bad task"
    })
    const runtime = new DelegationRuntime({ executor })
    const plan: DelegationPlan = {
      id: "del_partial_failure",
      tasks: [
        { id: "bad", prompt: "bad task" },
        { id: "good", prompt: "good task" }
      ]
    }

    await runtime.submitDelegation(plan)
    const run = await executor.runOnce()
    const summary = await runtime.collectDelegation(plan.id)

    expect(run.results.map((item) => item.worker.status).sort()).toEqual([
      "completed",
      "failed"
    ])
    expect(summary.status).toBe("failed")
    expect(summary.tasks.map((task) => task.status).sort()).toEqual([
      "failed",
      "succeeded"
    ])
    expect(
      summary.tasks.find((task) => task.task.id === "good")?.output
    ).toHaveLength(1)
    expect(summary.tasks.find((task) => task.task.id === "bad")?.error).toEqual({
      message: "planned executor failure: bad task"
    })
  })

  it("collects pending tasks before execution", async () => {
    const executor = new InMemoryDelegationExecutor()
    const runtime = new DelegationRuntime({ executor })
    const plan: DelegationPlan = {
      id: "del_pending",
      tasks: [
        { id: "one", prompt: "pending one" },
        { id: "two", prompt: "pending two" }
      ]
    }

    await runtime.submitDelegation(plan)
    const summary = await runtime.collectDelegation(plan.id)

    expect(summary.status).toBe("pending")
    expect(summary.tasks.map((task) => task.status)).toEqual([
      "pending",
      "pending"
    ])
  })

  it("derives stable task runtime ids", () => {
    expect(
      runtimeIdsForTask("delegation one", {
        id: "task/one",
        prompt: "hello"
      })
    ).toMatchObject({
      delegationId: "delegation one",
      taskId: "task/one",
      sessionId: "ses_delegation_delegation_one_task_one",
      inputId: "inp_delegation_delegation_one_task_one",
      jobId: "job_delegation_delegation_one_task_one",
      inputIdempotencyKey: "delegation:delegation one:task/one:input",
      jobIdempotencyKey: "delegation:delegation one:task/one:job"
    })
  })
})

interface InMemoryDelegationExecutorOptions {
  readonly responseText?: (request: SubmitUserTextRequest) => string
  readonly failWhenText?: string
}

class InMemoryDelegationExecutor implements DelegationExecutor {
  private readonly jobs = new Map<string, SchedulerJobRecord>()
  private readonly messages = new Map<string, SessionMessageRecord[]>()
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly responseText: (request: SubmitUserTextRequest) => string
  private readonly failWhenText: string | undefined
  active = 0
  maxActive = 0

  constructor(options: InMemoryDelegationExecutorOptions = {}) {
    this.responseText =
      options.responseText ?? ((request) => `delegated: ${request.text}`)
    this.failWhenText = options.failWhenText
  }

  async submitUserText(
    request: SubmitUserTextRequest
  ): Promise<SubmitUserTextResult> {
    const now = Date.now()
    const sessionId = request.sessionId ?? `ses_${this.sessions.size + 1}`
    const inputId = request.inputId ?? `inp_${this.jobs.size + 1}`
    const jobId = request.jobId ?? `job_${this.jobs.size + 1}`
    const session: SessionRecord = this.sessions.get(sessionId) ?? {
      id: sessionId,
      ...(request.title === undefined ? {} : { title: request.title }),
      kind: "agent",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
    this.sessions.set(sessionId, session)

    const existing = findJobByIdOrIdempotency(
      [...this.jobs.values()],
      jobId,
      request.jobIdempotencyKey
    )
    if (existing !== undefined) {
      return {
        session,
        inputId,
        receipt: {
          admission: {
            inputId,
            sessionId,
            durability: "local-durable",
            status: "admitted"
          },
          job: existing
        }
      }
    }

    const job = {
      id: jobId,
      kind: "session.run",
      state: "ready",
      principalId: request.principalId ?? "delegation-runtime-test",
      payload: {
        sessionId,
        inputId,
        text: request.text
      },
      scheduledAt: now,
      priority: 0,
      attempt: 0,
      maxAttempts: 1,
      retryPolicy: { strategy: "none" },
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.jobIdempotencyKey }),
      createdAt: now,
      updatedAt: now
    } satisfies SchedulerJobRecord
    this.jobs.set(job.id, job)

    return {
      session,
      inputId,
      receipt: {
        admission: {
          inputId,
          sessionId,
          durability: "local-durable",
          status: "admitted"
        },
        job
      }
    }
  }

  async runOnce() {
    const ready = [...this.jobs.values()].filter((job) => job.state === "ready")
    const results = await Promise.all(
      ready.map(async (job) => {
        this.active += 1
        this.maxActive = Math.max(this.maxActive, this.active)
        await Promise.resolve()
        const payload = job.payload
        if (!isJobPayload(payload)) {
          throw new Error("test job payload is invalid")
        }
        if (payload.text === this.failWhenText) {
          const failed = updateJob(job, "failed", {
            lastError: { message: `planned executor failure: ${payload.text}` },
            finishedAt: Date.now()
          })
          this.jobs.set(job.id, failed)
          this.active -= 1
          return {
            worker: { status: "failed" },
            job: failed
          }
        }
        const text = this.responseText({
          text: payload.text,
          sessionId: payload.sessionId,
          inputId: payload.inputId
        })
        const message = assistantMessage({
          sessionId: payload.sessionId,
          inputId: payload.inputId,
          text
        })
        this.messages.set(payload.sessionId, [
          ...(this.messages.get(payload.sessionId) ?? []),
          message
        ])
        const succeeded = updateJob(job, "succeeded", {
          result: { messageId: message.id },
          finishedAt: Date.now()
        })
        this.jobs.set(job.id, succeeded)
        this.active -= 1
        return {
          worker: { status: "completed" },
          job: succeeded
        }
      })
    )
    return { results }
  }

  async listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]> {
    return [...this.jobs.values()].filter((job) => {
      if (request.kind !== undefined && job.kind !== request.kind) {
        return false
      }
      if (request.state !== undefined && job.state !== request.state) {
        return false
      }
      return true
    }).slice(0, request.limit)
  }

  async listSessionMessages(request: {
    readonly sessionId: string
  }): Promise<SessionMessageRecord[]> {
    return this.messages.get(request.sessionId) ?? []
  }
}

function findJobByIdOrIdempotency(
  jobs: readonly SchedulerJobRecord[],
  jobId: string,
  idempotencyKey: string | undefined
): SchedulerJobRecord | undefined {
  return jobs.find(
    (job) => job.id === jobId ||
      (idempotencyKey !== undefined && job.idempotencyKey === idempotencyKey)
  )
}

function updateJob(
  job: SchedulerJobRecord,
  state: SchedulerJobRecord["state"],
  extra: Partial<SchedulerJobRecord>
): SchedulerJobRecord {
  return {
    ...job,
    state,
    attempt: job.attempt + 1,
    updatedAt: Date.now(),
    ...extra
  }
}

function assistantMessage(input: {
  readonly sessionId: string
  readonly inputId: string
  readonly text: string
}): SessionMessageRecord {
  const now = Date.now()
  return {
    id: `msg_${input.inputId}`,
    sessionId: input.sessionId,
    runId: `run_${input.inputId}`,
    inputId: input.inputId,
    role: "assistant",
    status: "completed",
    content: [textPart(input.text)],
    createdAt: now,
    updatedAt: now
  }
}

function textPart(text: string): TextMessagePart {
  return {
    type: "text",
    id: `text_${text.replaceAll(/\W+/g, "_")}`,
    text
  }
}

function textFromParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function isJobPayload(value: JsonValue): value is {
  readonly sessionId: string
  readonly inputId: string
  readonly text: string
} {
  const record = value as Readonly<Record<string, JsonValue>>
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof record.sessionId === "string" &&
    typeof record.inputId === "string" &&
    typeof record.text === "string"
  )
}
