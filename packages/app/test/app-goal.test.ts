import { createServer, type Server } from "node:http"
import { describe, expect, it } from "vitest"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import {
  createStorageTestStore,
  createTestTurnExecutionBinding
} from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const secretRef = "static://app-goal-provider"
const secretResolver = new SecretResolver([
  new StaticSecretProvider({ values: { [secretRef]: "goal-test-key" } })
])

describe("@wanex/app Goal commands", () => {
  it("continues after failed verification and freezes the current Provider per attempt", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: [
        { disposition: "continue", result: "failed", reason: "more work remains" },
        { disposition: "succeeded", result: "passed", reason: "goal is complete" }
      ],
      holdFirstVerifier: true
    })
    const app = await createGoalApp(storeDir, provider.baseUrl, "goal-provider-a", "model-a")
    const storage = createGoalStorage(storeDir)
    const goalEvents: Array<
      Parameters<Parameters<typeof app.events.subscribeGoalEvents>[0]>[0]
    > = []
    const unsubscribe = app.events.subscribeGoalEvents((event) => {
      goalEvents.push(event)
    })

    try {
      await storage.createSession({
        id: "ses_app_goal_provider_switch",
        title: "Goal Provider switch",
        kind: "agent"
      })
      const started = await app.commands.startGoal({
        id: "objective_app_goal_provider_switch",
        sessionId: "ses_app_goal_provider_switch",
        objective: "Complete the bounded implementation",
        boundaries: ["Keep the public contract stable"],
        constraints: ["Use the existing runtime host"],
        successCriteria: ["The implementation is complete and verified"],
        stopPolicy: {
          maxAttempts: 2,
          maxConsecutiveBlockedAttempts: 1
        },
        idempotencyKey: "app-goal-provider-switch"
      })
      expect(started.objective).toMatchObject({
        state: "active",
        activeAttemptId: expect.any(String),
        revision: 2
      })

      await withTimeout(
        provider.firstVerifierStarted,
        5_000,
        "first Goal verifier did not start"
      )
      await app.commands.upsertModelEndpoint({
        modelEndpoint: goalModelEndpoint(
          "goal-provider-b",
          "model-b",
          provider.baseUrl
        ),
        makeActive: true
      })
      provider.releaseFirstVerifier()

      const completed = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: "objective_app_goal_provider_switch"
        })
        expect(goal?.objective.state).toBe("succeeded")
        return goal!
      })
      expect(completed.attempts).toHaveLength(2)
      expect(completed.reviews.map((review) => review.disposition)).toEqual([
        "continue",
        "succeeded"
      ])
      expect(completed.verifications.map((verification) => verification.result)).toEqual([
        "failed",
        "passed"
      ])

      const turns = await storage.listSessionTurns({
        sessionId: "ses_app_goal_provider_switch"
      })
      expect(turns.map((turn) =>
        turn.executionBinding.modelEndpoint.endpointId
      )).toEqual([
        "goal-provider-a",
        "goal-provider-b"
      ])
      expect(provider.requests.map((request) => [request.kind, request.model])).toEqual([
        ["execution", "model-a"],
        ["verifier", "model-a"],
        ["execution", "model-b"],
        ["verifier", "model-b"]
      ])
      expect(goalEvents.map((event) => event.cause)).toEqual([
        "created",
        "attempt_admitted",
        "attempt_reviewed",
        "attempt_admitted",
        "attempt_reviewed"
      ])
      expect(goalEvents.at(-1)).toMatchObject({
        kind: "wanex-app.goal.invalidated",
        objectiveId: completed.objective.id,
        sessionId: completed.objective.sessionId
      })
    } finally {
      unsubscribe()
      provider.releaseFirstVerifier()
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("fails closed when verifier output is malformed", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: ["not-json"]
    })
    const app = await createGoalApp(storeDir, provider.baseUrl)
    const storage = createGoalStorage(storeDir)

    try {
      await storage.createSession({
        id: "ses_app_goal_malformed_verifier",
        title: "Malformed verifier",
        kind: "agent"
      })
      await app.commands.startGoal({
        id: "objective_app_goal_malformed_verifier",
        sessionId: "ses_app_goal_malformed_verifier",
        objective: "Never accept malformed verification",
        successCriteria: ["A strict verifier confirms completion"],
        stopPolicy: {
          maxAttempts: 1,
          maxConsecutiveBlockedAttempts: 1
        },
        idempotencyKey: "app-goal-malformed-verifier"
      })

      const completed = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: "objective_app_goal_malformed_verifier"
        })
        expect(goal?.objective.state).toBe("limit_reached")
        return goal!
      })
      expect(completed.reviews).toMatchObject([{ disposition: "continue" }])
      expect(completed.verifications).toMatchObject([{
        result: "inconclusive",
        reason: "goal verifier returned no valid completion decision"
      }])
      expect(JSON.stringify(completed)).not.toContain("not-json")
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("reviews a settled unreviewed attempt during startup recovery", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: [
        { disposition: "succeeded", result: "passed", reason: "recovered evidence passes" }
      ]
    })
    const modelEndpoint = goalModelEndpoint(
      "goal-recovery-provider",
      "goal-recovery-model",
      provider.baseUrl
    )
    const storage = createGoalStorage(storeDir)
    await seedSettledGoalAttempt(storage, modelEndpoint)

    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint,
      secretResolver
    })
    try {
      const recovered = await app.commands.readGoal({
        objectiveId: "objective_app_goal_startup_recovery"
      })
      expect(recovered).toMatchObject({
        objective: {
          state: "succeeded"
        },
        reviews: [{ disposition: "succeeded" }],
        verifications: [{ result: "passed" }]
      })
      expect(recovered?.objective).not.toHaveProperty("activeAttemptId")
      expect(provider.requests).toEqual([{
        kind: "verifier",
        model: "goal-recovery-model"
      }])
    } finally {
      await app.dispose()
      await storage.dispose()
      await closeServer(provider.server)
    }
  })

  it("cancels a running Goal attempt durably before aborting Provider work", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenBlockingGoalProvider()
    const app = await createGoalApp(storeDir, provider.baseUrl)
    const storage = createGoalStorage(storeDir)

    try {
      await storage.createSession({
        id: "ses_app_goal_cancel",
        title: "Cancel Goal",
        kind: "agent"
      })
      const started = await app.commands.startGoal({
        id: "objective_app_goal_cancel",
        sessionId: "ses_app_goal_cancel",
        objective: "Run until explicitly cancelled",
        successCriteria: ["The work completes"],
        idempotencyKey: "app-goal-cancel"
      })
      await withTimeout(
        provider.requestStarted,
        5_000,
        "running Goal Provider request did not start"
      )
      const cancelled = await app.commands.cancelGoal({
        objectiveId: started.objective.id,
        expectedRevision: started.objective.revision,
        reason: "user stopped Goal Mode",
        idempotencyKey: "app-goal-cancel-request"
      })
      expect(["cancel_requested", "cancelled"]).toContain(cancelled.objective.state)
      await withTimeout(
        provider.responseClosed,
        5_000,
        "Goal Provider request was not aborted"
      )

      const terminal = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: started.objective.id
        })
        expect(goal?.objective.state).toBe("cancelled")
        return goal!
      })
      expect(terminal.reviews).toEqual([])
      expect(terminal.verifications).toEqual([])
      const [attempt] = terminal.attempts
      const [turn] = await storage.listSessionTurns({
        sessionId: started.objective.sessionId
      })
      expect(turn).toMatchObject({
        id: attempt?.turnId,
        state: "cancelled",
        cancelReason: "user stopped Goal Mode"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("parks an active Goal without a Provider and wakes it after Provider setup", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: [
        { disposition: "succeeded", result: "passed", reason: "configured work passes" }
      ]
    })
    const storage = createGoalStorage(storeDir)
    await seedUnadmittedGoal(storage, {
      sessionId: "ses_app_goal_provider_setup",
      objectiveId: "objective_app_goal_provider_setup"
    })
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      secretResolver
    })

    try {
      const parked = await app.commands.readGoal({
        objectiveId: "objective_app_goal_provider_setup"
      })
      expect(parked).toMatchObject({
        objective: { state: "active", revision: 1 },
        attempts: []
      })

      await app.commands.upsertModelEndpoint({
        modelEndpoint: goalModelEndpoint(
          "goal-provider-after-setup",
          "goal-model-after-setup",
          provider.baseUrl
        ),
        makeActive: true
      })
      const completed = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: "objective_app_goal_provider_setup"
        })
        expect(goal?.objective.state).toBe("succeeded")
        return goal!
      })
      expect(completed.attempts).toHaveLength(1)
      expect(provider.requests.map((request) => request.kind)).toEqual([
        "execution",
        "verifier"
      ])
    } finally {
      await app.dispose()
      await storage.dispose()
      await closeServer(provider.server)
    }
  })

  it("lets already admitted user work finish before admitting Goal work", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: [
        { disposition: "succeeded", result: "passed", reason: "goal work passes" }
      ]
    })
    const app = await createGoalApp(storeDir, provider.baseUrl)
    const storage = createGoalStorage(storeDir)

    try {
      await storage.createSession({
        id: "ses_app_goal_user_priority",
        title: "User work priority",
        kind: "agent"
      })
      await app.stop()
      await app.commands.submitConversationOperation({
        sessionId: "ses_app_goal_user_priority",
        content: [{ type: "text", text: "Finish this user turn first" }],
        idempotencyKey: "app-goal-user-priority-turn"
      })
      const goal = await app.commands.startGoal({
        id: "objective_app_goal_user_priority",
        sessionId: "ses_app_goal_user_priority",
        objective: "Run only after existing user work",
        successCriteria: ["The Goal attempt runs after the user turn"],
        stopPolicy: {
          maxAttempts: 1,
          maxConsecutiveBlockedAttempts: 1
        },
        idempotencyKey: "app-goal-user-priority"
      })
      expect(goal.objective).toMatchObject({ state: "active", revision: 1 })
      expect(goal.attempts).toEqual([])

      app.start()
      const completed = await eventually(async () => {
        const current = await app.commands.readGoal({
          objectiveId: goal.objective.id
        })
        expect(current?.objective.state).toBe("succeeded")
        return current!
      })
      expect(completed.attempts).toHaveLength(1)
      expect(provider.requests.map((request) => request.kind)).toEqual([
        "execution",
        "execution",
        "verifier"
      ])
      const turns = await storage.listSessionTurns({
        sessionId: "ses_app_goal_user_priority"
      })
      expect(turns).toHaveLength(2)
      expect(turns[0]?.primaryInputId).not.toBe(completed.attempts[0]?.inputId)
      expect(turns[1]?.primaryInputId).toBe(completed.attempts[0]?.inputId)
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("parks recovery-required Goal work without verification or replay", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenRecoveryRequiredGoalProvider()
    const app = await createGoalApp(storeDir, provider.baseUrl)
    const storage = createGoalStorage(storeDir)

    try {
      await storage.createSession({
        id: "ses_app_goal_recovery_required",
        title: "Goal recovery required",
        kind: "agent"
      })
      await app.commands.startGoal({
        id: "objective_app_goal_recovery_required",
        sessionId: "ses_app_goal_recovery_required",
        objective: "Do not replay ambiguous partial output",
        successCriteria: ["Explicit recovery resolves partial work"],
        idempotencyKey: "app-goal-recovery-required"
      })

      const parked = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: "objective_app_goal_recovery_required"
        })
        expect(goal?.objective.state).toBe("paused")
        return goal!
      })
      expect(parked.objective).toMatchObject({
        activeAttemptId: parked.attempts[0]?.id,
        reason: {
          code: "user_paused",
          detail: "goal attempt requires explicit execution recovery"
        }
      })
      expect(parked.attempts).toHaveLength(1)
      expect(parked.reviews).toEqual([])
      expect(parked.verifications).toEqual([])
      const [turn] = await storage.listSessionTurns({
        sessionId: "ses_app_goal_recovery_required"
      })
      expect(turn?.state).toBe("recovery_required")
      expect(provider.requestCount).toBe(1)
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("reviews an in-flight attempt while paused and continues only after resume", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenScriptedGoalProvider({
      verifierDecisions: [
        { disposition: "continue", result: "failed", reason: "stale pre-pause review" },
        { disposition: "continue", result: "failed", reason: "pause after this attempt" },
        { disposition: "succeeded", result: "passed", reason: "resumed work passes" }
      ],
      holdFirstVerifier: true
    })
    const app = await createGoalApp(storeDir, provider.baseUrl)
    const storage = createGoalStorage(storeDir)

    try {
      await storage.createSession({
        id: "ses_app_goal_pause_resume",
        title: "Pause and resume Goal",
        kind: "agent"
      })
      const started = await app.commands.startGoal({
        id: "objective_app_goal_pause_resume",
        sessionId: "ses_app_goal_pause_resume",
        objective: "Pause safely between bounded attempts",
        successCriteria: ["Resumed work passes verification"],
        stopPolicy: {
          maxAttempts: 2,
          maxConsecutiveBlockedAttempts: 1
        },
        idempotencyKey: "app-goal-pause-resume"
      })
      await withTimeout(
        provider.firstVerifierStarted,
        5_000,
        "Goal verifier did not reach the pause boundary"
      )
      const pausing = await app.commands.pauseGoal({
        objectiveId: started.objective.id,
        expectedRevision: started.objective.revision,
        reason: "user paused Goal Mode",
        idempotencyKey: "app-goal-pause"
      })
      expect(pausing.objective).toMatchObject({
        state: "paused",
        activeAttemptId: started.objective.activeAttemptId
      })
      provider.releaseFirstVerifier()

      const paused = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: started.objective.id
        })
        expect(goal?.objective.state).toBe("paused")
        expect(goal?.objective).not.toHaveProperty("activeAttemptId")
        expect(goal?.reviews).toHaveLength(1)
        return goal!
      })
      expect(paused.attempts).toHaveLength(1)
      expect(paused.reviews[0]?.disposition).toBe("continue")

      const resumed = await app.commands.resumeGoal({
        objectiveId: paused.objective.id,
        expectedRevision: paused.objective.revision,
        reason: "user resumed Goal Mode",
        idempotencyKey: "app-goal-resume"
      })
      expect(resumed.objective.state).toBe("active")
      const completed = await eventually(async () => {
        const goal = await app.commands.readGoal({
          objectiveId: started.objective.id
        })
        expect(goal?.objective.state).toBe("succeeded")
        return goal!
      })
      expect(completed.attempts.map((attempt) => attempt.trigger)).toEqual([
        "initial",
        "user_resume"
      ])
      expect(completed.reviews).toHaveLength(2)
    } finally {
      provider.releaseFirstVerifier()
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })
})

function createGoalApp(
  storeDir: string,
  baseUrl: string,
  endpointId = "goal-provider",
  modelId = "goal-model"
) {
  return createWanexApp({
    storage: { kind: "local-system-service", storeDir },
    artifacts: { explicitPath: serviceBin },
    modelEndpoint: goalModelEndpoint(endpointId, modelId, baseUrl),
    secretResolver
  })
}

function goalModelEndpoint(id: string, modelId: string, baseUrl: string) {
  return appTestModelEndpoint({
    endpointId: id,
    protocolId: "openai-chat-completions",
    providerId: id,
    modelId,
    baseUrl,
    secretRef
  })
}

function createGoalStorage(storeDir: string) {
  return createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function seedSettledGoalAttempt(
  storage: ReturnType<typeof createGoalStorage>,
  modelEndpoint: ReturnType<typeof goalModelEndpoint>
): Promise<void> {
  const session = await storage.createSession({
    id: "ses_app_goal_startup_recovery",
    title: "Goal startup recovery",
    kind: "agent"
  })
  const objective = await storage.createObjective({
    id: "objective_app_goal_startup_recovery",
    sessionId: session.id,
    principalId: "wanex-app-goal",
    objective: "Recover and review settled work",
    successCriteria: [{
      id: "goal_criterion_001",
      description: "Settled work passes independent verification"
    }],
    verificationPolicy: {
      requirements: [{
        id: "goal_completion",
        criterionIds: ["goal_criterion_001"],
        verifierKind: "model",
        verifierRef: "wanex-app-goal-verifier-v1"
      }]
    },
    stopPolicy: {
      maxAttempts: 1,
      maxConsecutiveBlockedAttempts: 1
    },
    idempotencyKey: "app-goal-startup-recovery-create"
  })
  const admitted = await storage.admitObjectiveAttempt({
    objectiveId: objective.id,
    expectedRevision: objective.revision,
    trigger: "initial",
    idempotencyKey: "app-goal-startup-recovery-admit",
    turn: {
      id: "inp_app_goal_startup_recovery",
      turnId: "turn_app_goal_startup_recovery",
      sessionId: session.id,
      principalId: objective.principalId,
      idempotencyKey: "app-goal-startup-recovery-input",
      jobId: "job_app_goal_startup_recovery",
      jobIdempotencyKey: "app-goal-startup-recovery-job",
      content: [{
        id: "part_app_goal_startup_recovery",
        type: "text",
        text: "Perform the recovered Goal attempt"
      }],
      origin: { kind: "objective", sourceRef: objective.id },
      executionBinding: createTestTurnExecutionBinding(modelEndpoint)
    }
  })
  if (admitted.status !== "admitted") {
    throw new Error("startup recovery Goal attempt was not admitted")
  }
  const workerId = "worker_app_goal_startup_recovery"
  const job = await storage.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job?.leaseToken === undefined || job.id !== admitted.attempt.jobId) {
    throw new Error("startup recovery Goal job was not claimed")
  }
  const started = await storage.startSessionTurnAttempt({
    sessionId: session.id,
    turnId: admitted.attempt.turnId,
    inputId: admitted.attempt.inputId,
    jobId: admitted.attempt.jobId,
    workerId,
    leaseToken: job.leaseToken
  })
  const invocation = await storage.beginProviderInvocation({
    sessionId: session.id,
    turnId: admitted.attempt.turnId,
    attemptId: started.attempt.id,
    inputId: admitted.attempt.inputId,
    jobId: admitted.attempt.jobId,
    workerId,
    leaseToken: job.leaseToken,
    step: 1,
    invocationNumber: 1,
    requestDigest: "app-goal-startup-recovery-provider-request"
  })
  await storage.settleSessionTurn({
    sessionId: session.id,
    turnId: admitted.attempt.turnId,
    attemptId: started.attempt.id,
    inputId: admitted.attempt.inputId,
    jobId: admitted.attempt.jobId,
    workerId,
    leaseToken: job.leaseToken,
    outcome: "succeeded",
    providerInvocationId: invocation.id,
    assistantMessage: [{
      id: "assistant_app_goal_startup_recovery",
      type: "text",
      text: "Recovered Goal attempt completed"
    }]
  })
}

async function seedUnadmittedGoal(
  storage: ReturnType<typeof createGoalStorage>,
  options: {
    readonly sessionId: string
    readonly objectiveId: string
  }
): Promise<void> {
  await storage.createSession({
    id: options.sessionId,
    title: "Unadmitted Goal",
    kind: "agent"
  })
  await storage.createObjective({
    id: options.objectiveId,
    sessionId: options.sessionId,
    principalId: "wanex-app-goal",
    objective: "Resume after Provider setup",
    successCriteria: [{
      id: "goal_criterion_001",
      description: "Configured Provider completes the work"
    }],
    verificationPolicy: {
      requirements: [{
        id: "goal_completion",
        criterionIds: ["goal_criterion_001"],
        verifierKind: "model",
        verifierRef: "wanex-app-goal-verifier-v1"
      }]
    },
    stopPolicy: {
      maxAttempts: 1,
      maxConsecutiveBlockedAttempts: 1
    },
    idempotencyKey: `create:${options.objectiveId}`
  })
}

interface ScriptedGoalProvider {
  readonly server: Server
  readonly baseUrl: string
  readonly requests: Array<{
    readonly kind: "execution" | "verifier"
    readonly model: string
  }>
  readonly firstVerifierStarted: Promise<void>
  releaseFirstVerifier(): void
}

async function listenScriptedGoalProvider(options: {
  readonly verifierDecisions: readonly (
    | string
    | {
        readonly disposition: string
        readonly result: string
        readonly reason: string
      }
  )[]
  readonly holdFirstVerifier?: boolean
}): Promise<ScriptedGoalProvider> {
  const firstVerifierStarted = deferred<void>()
  const firstVerifierRelease = deferred<void>()
  const requests: ScriptedGoalProvider["requests"] = []
  let executionCount = 0
  let verifierCount = 0
  let verifierReleased = false
  const server = createServer(async (request, response) => {
    const body = await readJsonRequest(request)
    const serialized = JSON.stringify(body)
    const model = typeof body.model === "string" ? body.model : "missing-model"
    const kind = serialized.includes("WANEX_GOAL_VERIFIER_V1")
      ? "verifier" as const
      : "execution" as const
    requests.push({ kind, model })
    let content: string
    if (kind === "verifier") {
      if (verifierCount === 0) {
        firstVerifierStarted.resolve(undefined)
        if (options.holdFirstVerifier === true && !verifierReleased) {
          await firstVerifierRelease.promise
        }
      }
      const decision = options.verifierDecisions[verifierCount]
      verifierCount += 1
      content = typeof decision === "string"
        ? decision
        : JSON.stringify(decision ?? {
            disposition: "continue",
            result: "inconclusive",
            reason: "fixture has no verifier decision"
          })
    } else {
      executionCount += 1
      content = `Goal execution ${String(executionCount)} completed`
    }
    writeOpenAIStream(response, content)
  })
  const baseUrl = await listen(server)
  return {
    server,
    baseUrl,
    requests,
    firstVerifierStarted: firstVerifierStarted.promise,
    releaseFirstVerifier() {
      verifierReleased = true
      firstVerifierRelease.resolve(undefined)
    }
  }
}

async function listenBlockingGoalProvider(): Promise<{
  readonly server: Server
  readonly baseUrl: string
  readonly requestStarted: Promise<void>
  readonly responseClosed: Promise<void>
}> {
  const requestStarted = deferred<void>()
  const responseClosed = deferred<void>()
  const server = createServer(async (request, response) => {
    await readJsonRequest(request)
    response.once("close", () => responseClosed.resolve(undefined))
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.flushHeaders()
    requestStarted.resolve(undefined)
  })
  return {
    server,
    baseUrl: await listen(server),
    requestStarted: requestStarted.promise,
    responseClosed: responseClosed.promise
  }
}

async function listenRecoveryRequiredGoalProvider(): Promise<{
  readonly server: Server
  readonly baseUrl: string
  readonly requestCount: number
}> {
  let requestCount = 0
  const server = createServer(async (request, response) => {
    await readJsonRequest(request)
    requestCount += 1
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end(`data: ${JSON.stringify({
      choices: [{ delta: { content: "partial Goal output" }, finish_reason: null }]
    })}\n\n`)
  })
  const result = {
    server,
    baseUrl: await listen(server),
    get requestCount() {
      return requestCount
    }
  }
  return result
}

async function readJsonRequest(
  request: import("node:http").IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
}

function writeOpenAIStream(
  response: import("node:http").ServerResponse,
  content: string
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache"
  })
  response.end([
    `data: ${JSON.stringify({
      choices: [{ delta: { content }, finish_reason: null }]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }]
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join(""))
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Goal Provider fixture did not expose a TCP address")
  }
  return `http://127.0.0.1:${address.port}/v1`
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
