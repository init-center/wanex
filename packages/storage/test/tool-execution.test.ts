import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  BeginToolExecutionReceipt,
  BeginToolExecutionRequest,
  JsonValue
} from "@wanex/protocol"
import { createStorageTestStore } from "../src/testing.js"

const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("durable tool execution storage", () => {
  it("fences tool execution by exact source message and settles idempotently", async () => {
    const fixture = await createTurnFixture()
    const request = beginRequest(fixture, "call_allowed", "running", {
      status: "allow",
      reason: "test"
    })
    const presentedRequest = {
      ...request,
      activity: {
        call: {
          summary: "Echo supplied text",
          details: [{ label: "Input", value: "Configured text" }]
        }
      }
    }
    const first = await fixture.store.beginToolExecution(presentedRequest)
    expect(first.created).toBe(true)
    expect(first.execution).toMatchObject({
      state: "running",
      attemptCount: 1,
      toolCallId: "call_allowed",
      turnId: fixture.turnId,
      sourceMessageId: fixture.sourceMessageId
    })
    expect(first.invocationAttempt).toMatchObject({
      sessionAttemptId: fixture.attemptId,
      attemptNumber: 1,
      state: "running"
    })
    await expect(fixture.store.beginToolExecution(presentedRequest)).resolves.toEqual({
      execution: first.execution,
      invocationAttempt: first.invocationAttempt,
      created: false
    })
    await expect(
      fixture.store.beginToolExecution({
        ...presentedRequest,
        descriptor: {
          name: "echo",
          risk: "read_only",
          idempotent: false
        }
      })
    ).rejects.toThrow("conflicting repeated tool execution begin")
    await expect(fixture.store.beginToolExecution({
      ...presentedRequest,
      activity: { call: { summary: "x".repeat(513) } }
    })).rejects.toThrow("1 to 512 UTF-8 bytes")

    const bytes = Buffer.from("tool output image bytes")
    const resource = await fixture.store.ingestResource({
      content: bytes,
      kind: "image",
      origin: "tool_output",
      mediaType: "image/png",
      expectedSha256: createHash("sha256").update(bytes).digest("hex")
    })
    const resourceEvidence = {
      resourceId: resource.id,
      sha256: resource.sha256,
      sizeBytes: resource.sizeBytes,
      kind: resource.kind,
      ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
    } as const
    const provenanceRequest = {
      resource: resourceEvidence,
      cause: {
        kind: "tool_execution" as const,
        executionId: first.execution.id,
        sessionId: fixture.sessionId,
        turnId: fixture.turnId,
        sourceMessageId: fixture.sourceMessageId,
        toolCallId: first.execution.toolCallId
      },
      inputResources: []
    }
    const provenance = await fixture.store.recordResourceProvenance(provenanceRequest)
    expect(provenance).toMatchObject(provenanceRequest)
    await expect(
      fixture.store.recordResourceProvenance(provenanceRequest)
    ).resolves.toEqual(provenance)
    await expect(
      fixture.store.listResourceProvenance({
        causeKind: "tool_execution",
        causeId: first.execution.id
      })
    ).resolves.toEqual([provenance])
    await expect(
      fixture.store.recordResourceProvenance({
        ...provenanceRequest,
        cause: { ...provenanceRequest.cause, toolCallId: "call_changed" }
      })
    ).rejects.toThrow("tool provenance cause does not match durable execution identity")

    const finish = finishRequest(fixture, first)
    const changedResourceContent = [{
      type: "resource" as const,
      ...resourceEvidence,
      sha256: "0".repeat(64)
    }]
    await expect(
      fixture.store.finishToolExecution({
        ...finish,
        state: "succeeded",
        content: changedResourceContent,
        contentDigest: digestJson(changedResourceContent),
        isError: false
      })
    ).rejects.toThrow("resource evidence does not match available immutable resource")
    const content = [
      { type: "text" as const, text: "created image" },
      { type: "json" as const, value: { ok: true } },
      { type: "resource" as const, ...resourceEvidence }
    ]
    const contentDigest = digestJson(content)
    const finished = await fixture.store.finishToolExecution({
      ...finish,
      state: "succeeded",
      content,
      contentDigest,
      isError: false,
      resultPresentation: {
        summary: "Text echoed",
        details: [{ label: "Status", value: "Succeeded" }]
      }
    })
    expect(finished).toMatchObject({
      state: "succeeded",
      content,
      contentDigest
    })
    await expect(
      fixture.store.finishToolExecution({
        ...finish,
        state: "succeeded",
        content,
        contentDigest,
        isError: false,
        resultPresentation: {
          summary: "Text echoed",
          details: [{ label: "Status", value: "Succeeded" }]
        }
      })
    ).resolves.toEqual(finished)
    await expect(
      fixture.store.listToolExecutions({ turnId: fixture.turnId })
    ).resolves.toMatchObject([
      {
        id: first.execution.id,
        state: "succeeded",
        activity: {
          call: { summary: "Echo supplied text" },
          result: { summary: "Text echoed" }
        }
      }
    ])
    const activities = await fixture.store.listToolActivities({
      sessionId: fixture.sessionId,
      sourceMessageIds: [fixture.sourceMessageId]
    })
    expect(activities).toMatchObject([{
      sessionId: fixture.sessionId,
      sourceMessageId: fixture.sourceMessageId,
      toolCallId: "call_allowed",
      activity: {
        call: { summary: "Echo supplied text" },
        result: { summary: "Text echoed" }
      }
    }])
    expect(JSON.stringify(activities)).not.toContain('"input"')
    expect(JSON.stringify(activities)).not.toContain('"descriptor"')
    expect(JSON.stringify(activities)).not.toContain('"permission"')
    expect(JSON.stringify(activities)).not.toContain('"id"')
    await expect(
      fixture.store.listToolExecutionAttempts({
        executionId: first.execution.id
      })
    ).resolves.toMatchObject([
      {
        id: first.invocationAttempt!.id,
        sessionAttemptId: fixture.attemptId,
        state: "succeeded"
      }
    ])

    await expect(
      fixture.store.beginToolExecution({
        ...beginRequest(fixture, "call_missing", "running", {
          status: "allow",
          reason: "test"
        }),
        idempotencyKey: "tool:missing"
      })
    ).rejects.toThrow(
      "tool execution call is not present in its source assistant message"
    )
  })

  it("durably suspends, approves once, and resumes one exact physical invocation", async () => {
    const fixture = await createTurnFixture()
    const request = approvalBeginRequest(fixture)
    const begun = await fixture.store.beginToolExecution(request)
    expect(begun).toMatchObject({
      created: true,
      execution: {
        state: "approval_required",
        approvalRevision: 0,
        attemptCount: 0
      },
      approvalSuspension: {
        execution: { state: "approval_required" },
        attempt: { id: fixture.attemptId, state: "suspended" },
        turn: { id: fixture.turnId, state: "waiting" },
        job: { id: fixture.jobId, state: "waiting" }
      }
    })
    expect(begun).not.toHaveProperty("invocationAttempt")
    expect(begun.approvalSuspension!.job).not.toHaveProperty("leaseOwner")
    expect(begun.approvalSuspension!.job).not.toHaveProperty("leaseToken")
    expect(begun.approvalSuspension!.job).not.toHaveProperty("leaseExpiresAt")
    await expect(fixture.store.listToolExecutionAttempts({
      executionId: begun.execution.id
    })).resolves.toEqual([])
    await expect(fixture.store.getToolExecutionByCall({
      turnId: fixture.turnId,
      sourceMessageId: fixture.sourceMessageId,
      toolCallId: request.toolCallId
    })).resolves.toEqual(begun.execution)

    const approvalRequest = {
      executionId: begun.execution.id,
      expectedApprovalRevision: 0,
      decision: "approve_once" as const,
      principalId: "principal_tools",
      reason: "reviewed exact read-only action",
      idempotencyKey: "approve:" + begun.execution.id
    }
    await expect(fixture.store.resolveToolExecutionApproval({
      ...approvalRequest,
      principalId: "principal_other",
      idempotencyKey: "approve:wrong-principal"
    })).rejects.toThrow("reviewer does not match")
    const approved = await fixture.store.resolveToolExecutionApproval(approvalRequest)
    expect(approved).toMatchObject({
      execution: { state: "approved", approvalRevision: 1, attemptCount: 0 },
      approvalDecision: {
        approvalRevision: 1,
        decision: "approve_once",
        action: "turn_requeued"
      },
      turn: { id: fixture.turnId, state: "queued" },
      job: { id: fixture.jobId, state: "ready" }
    })
    await expect(
      fixture.store.resolveToolExecutionApproval(approvalRequest)
    ).resolves.toEqual(approved)
    await expect(fixture.store.resolveToolExecutionApproval({
      ...approvalRequest,
      decision: "deny",
      reason: "conflicting decision"
    })).rejects.toThrow("conflicting repeated tool approval decision")
    await expect(fixture.store.resolveToolExecutionApproval({
      ...approvalRequest,
      idempotencyKey: "approve:stale"
    })).rejects.toThrow("stale")

    const resumedWorkerId = "worker_tools_approved"
    const resumedJob = await fixture.store.claimJob({
      workerId: resumedWorkerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (resumedJob?.leaseToken === undefined) throw new Error("missing resumed Tool lease")
    const resumed = await fixture.store.startSessionTurnAttempt({
      sessionId: fixture.sessionId,
      turnId: fixture.turnId,
      inputId: fixture.inputId,
      jobId: fixture.jobId,
      workerId: resumedWorkerId,
      leaseToken: resumedJob.leaseToken
    })
    const resumedRequest = {
      ...request,
      attemptId: resumed.attempt.id,
      workerId: resumedWorkerId,
      leaseToken: resumedJob.leaseToken
    }
    const invocation = await fixture.store.beginToolExecution(resumedRequest)
    expect(invocation).toMatchObject({
      created: false,
      execution: { state: "running", approvalRevision: 1, attemptCount: 1 },
      invocationAttempt: {
        sessionAttemptId: resumed.attempt.id,
        attemptNumber: 1,
        state: "running"
      }
    })
    await expect(
      fixture.store.beginToolExecution(resumedRequest)
    ).resolves.toEqual(invocation)

    const events = await fixture.store.queryEvents({
      scope: { turnId: fixture.turnId },
      limit: 20
    })
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool.execution.approval_required",
        "tool.execution.approval_resolved"
      ])
    )
  })

  it("durably denies approval without creating a physical invocation", async () => {
    const fixture = await createTurnFixture()
    const request = approvalBeginRequest(fixture)
    const begun = await fixture.store.beginToolExecution(request)
    const decision = {
      executionId: begun.execution.id,
      expectedApprovalRevision: 0,
      decision: "deny" as const,
      principalId: "principal_tools",
      reason: "operator denied this action",
      idempotencyKey: "deny:" + begun.execution.id
    }
    const denied = await fixture.store.resolveToolExecutionApproval(decision)
    expect(denied.execution).toMatchObject({
      state: "denied",
      approvalRevision: 1,
      attemptCount: 0,
      isError: true,
      error: {
        error: "approval_denied",
        reason: "operator denied this action"
      }
    })
    expect(denied.execution.content).toEqual([{
      type: "json",
      value: {
        error: "approval_denied",
        toolName: "echo",
        reason: "operator denied this action"
      }
    }])
    await expect(
      fixture.store.resolveToolExecutionApproval(decision)
    ).resolves.toEqual(denied)
    await expect(fixture.store.listToolExecutionAttempts({
      executionId: begun.execution.id
    })).resolves.toEqual([])

    const workerId = "worker_tools_denied"
    const job = await fixture.store.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (job?.leaseToken === undefined) throw new Error("missing denied Tool resume lease")
    const started = await fixture.store.startSessionTurnAttempt({
      sessionId: fixture.sessionId,
      turnId: fixture.turnId,
      inputId: fixture.inputId,
      jobId: fixture.jobId,
      workerId,
      leaseToken: job.leaseToken
    })
    const reused = await fixture.store.beginToolExecution({
      ...request,
      attemptId: started.attempt.id,
      workerId,
      leaseToken: job.leaseToken
    })
    expect(reused).toMatchObject({
      created: false,
      execution: { state: "denied", attemptCount: 0 }
    })
    expect(reused).not.toHaveProperty("invocationAttempt")
  })

  it("cancels a waiting approval and wakes the same Turn for terminal settlement", async () => {
    const fixture = await createTurnFixture()
    const begun = await fixture.store.beginToolExecution(approvalBeginRequest(fixture))
    const cancellation = await fixture.store.requestSessionTurnCancel({
      sessionId: fixture.sessionId,
      turnId: fixture.turnId,
      inputId: fixture.inputId,
      jobId: fixture.jobId,
      reason: "user cancelled pending approval"
    })
    expect(cancellation).toMatchObject({
      status: "cancel_requested",
      turn: { id: fixture.turnId, state: "cancel_requested" },
      job: { id: fixture.jobId, state: "ready" },
      cascadeJobIds: []
    })
    await expect(
      fixture.store.requestSessionTurnCancel({
        sessionId: fixture.sessionId,
        turnId: fixture.turnId,
        inputId: fixture.inputId,
        jobId: fixture.jobId,
        reason: "user cancelled pending approval"
      })
    ).resolves.toMatchObject({
      status: "cancel_requested",
      turn: { state: "cancel_requested" },
      job: { state: "ready" }
    })

    const cancelledTool = await fixture.store.getToolExecution(begun.execution.id)
    expect(cancelledTool).toMatchObject({
      state: "cancelled",
      approvalRevision: 1,
      attemptCount: 0,
      error: {
        reason: "turn_cancelled_while_awaiting_approval",
        message: "user cancelled pending approval"
      }
    })
    await expect(fixture.store.resolveToolExecutionApproval({
      executionId: begun.execution.id,
      expectedApprovalRevision: 0,
      decision: "approve_once",
      principalId: "principal_tools",
      reason: "late approval",
      idempotencyKey: "late-approval:" + begun.execution.id
    })).rejects.toThrow("stale")

    const workerId = "worker_tools_cancel"
    const job = await fixture.store.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (job?.leaseToken === undefined) throw new Error("missing cancellation settlement lease")
    const started = await fixture.store.startSessionTurnAttempt({
      sessionId: fixture.sessionId,
      turnId: fixture.turnId,
      inputId: fixture.inputId,
      jobId: fixture.jobId,
      workerId,
      leaseToken: job.leaseToken
    })
    const settled = await fixture.store.settleSessionTurn({
      sessionId: fixture.sessionId,
      turnId: fixture.turnId,
      attemptId: started.attempt.id,
      inputId: fixture.inputId,
      jobId: fixture.jobId,
      workerId,
      leaseToken: job.leaseToken,
      outcome: "cancelled",
      reason: "user cancelled pending approval"
    })
    expect(settled).toMatchObject({
      turn: { state: "cancelled" },
      attempt: { state: "cancelled" },
      job: { state: "cancelled" }
    })
  })

  it("projects deferred media handoff and exact conversation relation over both local transports", async () => {
    for (const mode of ["oneshot", "persistent"] as const) {
      const fixture = await createDeferredTurnFixture(mode)
      const begun = await fixture.store.beginToolExecution({
        sessionId: fixture.sessionId,
        turnId: fixture.turnId,
        attemptId: fixture.attemptId,
        inputId: fixture.inputId,
        sourceMessageId: fixture.sourceMessageId,
        jobId: fixture.jobId,
        workerId: fixture.workerId,
        leaseToken: fixture.leaseToken,
        principalId: "principal_deferred_" + mode,
        toolCallId: fixture.toolCallId,
        toolName: "image_generate",
        input: { prompt: "storage deferred image" },
        descriptor: {
          name: "image_generate",
          description: "Generate an image from text.",
          inputSchema: { type: "object" },
          risk: "external",
          idempotent: true,
          concurrency: "exclusive",
          resultMode: "deferred",
          requiredCapabilities: [imageGenerationRequirement],
          runtimeBinding: {
            implementationId: "wanex.test.storage.image-generate",
            implementationRevision: "1"
          }
        },
        permission: { status: "allow", reason: "test" },
        state: "running",
        idempotencyKey: `tool:${fixture.sourceMessageId}:${fixture.toolCallId}`
      })
      const request = {
        sessionId: fixture.sessionId,
        turnId: fixture.turnId,
        sessionAttemptId: fixture.attemptId,
        inputId: fixture.inputId,
        sourceMessageId: fixture.sourceMessageId,
        sessionJobId: fixture.jobId,
        workerId: fixture.workerId,
        leaseToken: fixture.leaseToken,
        toolExecutionId: begun.execution.id,
        toolInvocationAttemptId: begun.invocationAttempt!.id,
        toolCallId: fixture.toolCallId,
        operation: {
          kind: "media_generation" as const,
          binding: deferredMediaBinding(mode)
        }
      }

      const receipt = await fixture.store.deferToolExecution(request)
      expect(receipt).toMatchObject({
        turn: { id: fixture.turnId, state: "waiting" },
        sessionAttempt: { id: fixture.attemptId, state: "suspended" },
        sessionJob: { id: fixture.jobId, state: "waiting" },
        toolExecution: { id: begun.execution.id, state: "waiting" },
        toolInvocationAttempt: {
          id: begun.invocationAttempt!.id,
          state: "suspended"
        },
        operation: {
          kind: "media_generation",
          record: {
            state: "queued",
            conversation: {
              sessionId: fixture.sessionId,
              turnId: fixture.turnId,
              sourceMessageId: fixture.sourceMessageId,
              toolExecutionId: begun.execution.id,
              toolCallId: fixture.toolCallId
            }
          },
          job: { state: "ready" }
        }
      })
      expect(receipt.sessionJob).not.toHaveProperty("leaseOwner")
      expect(receipt.sessionJob).not.toHaveProperty("leaseToken")
      await expect(
        fixture.store.deferToolExecution(request)
      ).resolves.toEqual(receipt)
      await expect(
        fixture.store.getMediaGenerationOperation({
          operationId: receipt.operation.record.id
        })
      ).resolves.toEqual(receipt.operation.record)
    }
  })
})

async function createStore(mode: "oneshot" | "persistent" = "oneshot") {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-tool-storage-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({
    kind: "local-system-service",
    mode,
    storeDir,
    serviceBin
  })
}

async function createDeferredTurnFixture(mode: "oneshot" | "persistent") {
  const store = await createStore(mode)
  const sessionId = `session_deferred_${mode}`
  const turnId = `turn_deferred_${mode}`
  const inputId = `input_deferred_${mode}`
  const jobId = `job_deferred_${mode}`
  const workerId = `worker_deferred_${mode}`
  const toolCallId = `call_deferred_${mode}`
  await store.createSession({ id: sessionId, kind: "agent" })
  await store.submitSessionTurn({
    id: inputId,
    turnId,
    sessionId,
    principalId: `principal_deferred_${mode}`,
    idempotencyKey: `idem_deferred_${mode}`,
    content: [{
      type: "text",
      id: `part_deferred_user_${mode}`,
      text: "generate an image"
    }],
    jobId,
    executionBinding: deferredTurnBinding(mode)
  })
  const job = await store.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job?.leaseToken === undefined) throw new Error("missing deferred turn lease")
  const started = await store.startSessionTurnAttempt({
    sessionId,
    turnId,
    inputId,
    jobId,
    workerId,
    leaseToken: job.leaseToken
  })
  const source = await store.appendSessionMessage({
    sessionId,
    turnId,
    attemptId: started.attempt.id,
    inputId,
    jobId,
    workerId,
    leaseToken: job.leaseToken,
    idempotencyKey: `deferred_tool_source_${mode}`,
    role: "assistant",
    content: [{
      type: "tool_call",
      id: `part_${toolCallId}`,
      toolCallId,
      toolName: "image_generate",
      input: { prompt: "storage deferred image" }
    }]
  })
  if (source === null) throw new Error("missing deferred Tool source message")
  return {
    store,
    sessionId,
    turnId,
    attemptId: started.attempt.id,
    inputId,
    sourceMessageId: source.id,
    jobId,
    workerId,
    leaseToken: job.leaseToken,
    toolCallId
  }
}

async function createTurnFixture() {
  const store = await createStore()
  const sessionId = "session_tools"
  const turnId = "turn_tools"
  const inputId = "input_tools"
  const jobId = "job_tools"
  const workerId = "worker_tools"
  await store.createSession({ id: sessionId, kind: "agent" })
  const submitted = await store.submitSessionTurn({
    id: inputId,
    turnId,
    sessionId,
    principalId: "principal_tools",
    idempotencyKey: "idem_tools",
    content: [{
      type: "text",
      id: "part_tools_user",
      text: "use tools"
    }],
    jobId,
    executionBinding: testTurnBinding()
  })
  const job = await store.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  const started = await store.startSessionTurnAttempt({
    sessionId,
    turnId,
    inputId,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!
  })
  const source = await store.appendSessionMessage({
    sessionId,
    turnId,
    attemptId: started.attempt.id,
    inputId,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!,
    idempotencyKey: "tool_source",
    role: "assistant",
    content: [
      toolCall("call_allowed"),
      toolCall("call_denied"),
      toolCall("call_approval")
    ]
  })
  return {
    store,
    sessionId,
    turnId: submitted.turn.id,
    attemptId: started.attempt.id,
    inputId,
    sourceMessageId: source!.id,
    jobId,
    workerId,
    leaseToken: job!.leaseToken!
  }
}

function beginRequest(
  fixture: Awaited<ReturnType<typeof createTurnFixture>>,
  toolCallId: string,
  state: BeginToolExecutionRequest["state"],
  permission: JsonValue
): BeginToolExecutionRequest {
  return {
    sessionId: fixture.sessionId,
    turnId: fixture.turnId,
    attemptId: fixture.attemptId,
    inputId: fixture.inputId,
    sourceMessageId: fixture.sourceMessageId,
    jobId: fixture.jobId,
    workerId: fixture.workerId,
    leaseToken: fixture.leaseToken,
    principalId: "principal_tools",
    toolCallId,
    toolName: "echo",
    input: { text: "hello" },
    descriptor: {
      name: "echo",
      risk: "read_only",
      idempotent: true
    },
    permission,
    state,
    idempotencyKey: "tool:" + fixture.sourceMessageId + ":" + toolCallId
  }
}

function approvalBeginRequest(
  fixture: Awaited<ReturnType<typeof createTurnFixture>>
): BeginToolExecutionRequest {
  const base = beginRequest(fixture, "call_approval", "approval_required", {
    status: "approval_required",
    reason: "human review",
    presentation: {
      summary: "Allow echo to read the supplied text",
      details: [{ label: "Tool", value: "echo" }]
    },
    authorizationRef: "policy:test:echo"
  })
  return {
    ...base,
    descriptor: {
      ...base.descriptor as Record<string, JsonValue>,
      concurrency: "exclusive"
    }
  }
}

function toolCall(toolCallId: string) {
  return {
    type: "tool_call" as const,
    id: "part_" + toolCallId,
    toolCallId,
    toolName: "echo",
    input: { text: "hello" }
  }
}

function finishRequest(
  fixture: Awaited<ReturnType<typeof createTurnFixture>>,
  receipt: BeginToolExecutionReceipt
) {
  return {
    sessionId: fixture.sessionId,
    turnId: fixture.turnId,
    sessionAttemptId: fixture.attemptId,
    inputId: fixture.inputId,
    jobId: fixture.jobId,
    workerId: fixture.workerId,
    leaseToken: fixture.leaseToken,
    executionId: receipt.execution.id,
    invocationAttemptId: receipt.invocationAttempt!.id
  }
}

function testTurnBinding() {
  const endpoint = {
    id: "profile_tools",
    connection: { id: "connection_tools", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "model_tools",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "storage.tool-test",
        revision: "1"
      }
    }
  } as const
  const modelEndpoint = {
    endpointId: endpoint.id,
    endpointDigest: digestJson(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model
  } as const
  const binding = {
    createdAt: 1,
    modelEndpoint,
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [],
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  return { digest: digestJson(binding), ...binding }
}

const imageGenerationRequirement = {
  operation: "image.generate",
  inputModalities: ["text"],
  outputModalities: ["image"],
  features: []
} as const

function deferredTurnBinding(label: string) {
  const base = testTurnBinding()
  const media = deferredMediaBinding(label)
  const { digest: _digest, ...unsignedBase } = base
  const unsigned = {
    ...unsignedBase,
    capabilityRoutes: [{
      requirement: imageGenerationRequirement,
      source: "single_candidate" as const,
      modelEndpoint: {
        endpointId: media.endpointId,
        endpointDigest: media.endpointDigest,
        connection: media.connection,
        protocol: media.protocol,
        model: media.model
      }
    }]
  }
  return { digest: digestJson(unsigned), ...unsigned }
}

function deferredMediaBinding(label: string) {
  const endpoint = {
    id: `media_endpoint_${label}`,
    connection: {
      id: `media_connection_${label}`,
      providerId: "fake-media"
    },
    protocol: { id: "fake-media" },
    model: {
      id: `media_model_${label}`,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `storage.media.${label}`,
        revision: "1"
      }
    }
  } as const
  const request = {
    operation: "image.generate" as const,
    prompt: "storage deferred image",
    outputModality: "image" as const,
    inputResources: [],
    options: null
  }
  return {
    endpointId: endpoint.id,
    endpointDigest: digestJson(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    request,
    requestDigest: digestJson(request)
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
