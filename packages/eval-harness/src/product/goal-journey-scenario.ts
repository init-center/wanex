import { rm } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type GoalInvalidationCause,
  type SurfaceEvent
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"
import {
  createTuiSurface,
  renderTuiGoal
} from "@wanex/tui"
import {
  createSurface
} from "@wanex/web"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { mktemp } from "../product-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"

const SESSION_ID = "ses_eval_product_goal"
const ENDPOINT_ID = "eval-product-goal-provider"
const MODEL_ID = "eval-product-goal-model"
const SECRET_REF = "static://eval-product-goal-provider"
const OBJECTIVE = "Complete the bounded Product Goal journey"

export const goalJourneyScenario = createEvalScenario({
  id: "product.goal-mode-operational",
  title: "Product Goal Mode projects one App-owned durable Goal journey",
  tags: [
    "product",
    "goal",
    "surface",
    "web",
    "tui",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-goal-")
    const seed = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin: context.serviceBin
    })
    await seed.createSession({
      id: SESSION_ID,
      title: "Eval Product Goal",
      kind: "agent"
    })
    await seed.dispose()

    const provider = await listenGoalProvider()
    const stateStore = createMemoryStateStore()
    const app = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      modelEndpoint: evalOpenAICompatibleModelEndpoint({
        id: ENDPOINT_ID,
        modelId: MODEL_ID,
        baseUrl: provider.baseUrl,
        secretRef: SECRET_REF
      }),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({
          values: { [SECRET_REF]: "eval-product-goal-secret" }
        })
      ]),
      stateStore
    })
    const evidence = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin: context.serviceBin
    })
    const surface = createSurfaceAdapter(app, {
      streamId: "eval-product-goal-stream"
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    )
    const observedEvents: SurfaceEvent[] = []
    const unsubscribe = surface.subscribeSurfaceEvents((event) => {
      observedEvents.push(event)
    })

    try {
      await app.selectSession({ sessionId: SESSION_ID })
      const web = await createSurface({
        client,
        eventLimit: 100,
        now: () => 18_040
      })
      const tui = await createTuiSurface({
        client,
        eventLimit: 100,
        now: () => 18_041
      })
      const initialTuiGoal = tui.snapshot().goal
      assert(
        web.snapshot().goal.state === "missing" &&
          initialTuiGoal.ok &&
          initialTuiGoal.value.kind === "product.goal.missing",
        "Web and TUI should begin from the same canonical missing Goal state"
      )

      const started = await client.startGoal({
        sessionId: SESSION_ID,
        objective: OBJECTIVE,
        boundaries: ["Keep one App-owned coordinator"],
        constraints: ["Use ordinary durable Session Turns"],
        successCriteria: ["Independent verification passes after resume"],
        stopPolicy: {
          maxAttempts: 2,
          maxConsecutiveBlockedAttempts: 1
        },
        idempotencyKey: "eval-product-goal-start"
      })
      assert(
        started.ok &&
          started.value.state === "active" &&
          started.value.attemptCount === 1,
        "Product Surface should start one App-owned Goal and admit one attempt"
      )
      const goalId = started.value.goalId

      await withTimeout(
        provider.firstVerifierStarted,
        5_000,
        "first Goal verifier did not reach the review boundary"
      )
      const stale = await client.pauseGoal({
        goalId,
        expectedRevision: started.value.revision + 1,
        reason: "stale pause must fail",
        idempotencyKey: "eval-product-goal-stale-pause"
      })
      assert(!stale.ok, "stale Goal revision must fail closed at Product Surface")

      const paused = await client.pauseGoal({
        goalId,
        expectedRevision: started.value.revision,
        reason: "pause at the first review boundary",
        idempotencyKey: "eval-product-goal-pause"
      })
      assert(
        paused.ok && paused.value.state === "paused",
        "exact Goal revision should pause future attempt admission"
      )
      const firstReviewed = waitForGoalCause({
        surface,
        observedEvents,
        cause: "attempt_reviewed",
        occurrence: 1
      })
      provider.releaseFirstVerifier()
      await firstReviewed

      const canonicalPaused = await client.readGoal({ goalId })
      assert(
        canonicalPaused.ok &&
          canonicalPaused.value.kind === "product.goal.found" &&
          canonicalPaused.value.goal.state === "paused" &&
          canonicalPaused.value.goal.attemptCount === 1 &&
          canonicalPaused.value.goal.attempts[0]?.review?.disposition ===
            "continue",
        "paused Goal should finish reviewing admitted work without admitting another attempt"
      )

      const terminalInvalidation = waitForGoalCause({
        surface,
        observedEvents,
        cause: "attempt_reviewed",
        occurrence: 2
      })
      const resumed = await client.resumeGoal({
        goalId,
        expectedRevision: canonicalPaused.value.goal.revision,
        reason: "resume after review",
        idempotencyKey: "eval-product-goal-resume"
      })
      assert(
        resumed.ok &&
          resumed.value.state === "active" &&
          resumed.value.attemptCount === 2,
        "resume should admit only one future Goal attempt"
      )
      await terminalInvalidation

      const canonical = await client.readGoal({ goalId })
      assert(
        canonical.ok &&
          canonical.value.kind === "product.goal.found" &&
          canonical.value.goal.state === "succeeded" &&
          canonical.value.goal.attemptCount === 2 &&
          canonical.value.goal.attempts.map((attempt) => attempt.trigger).join(",") ===
            "initial,user_resume" &&
          canonical.value.goal.attempts
            .flatMap((attempt) => attempt.verifications)
            .map((verification) => verification.result)
            .join(",") === "failed,passed",
        "canonical Goal reread should reach terminal independent verification"
      )

      const [inputs, turns, messages] = await Promise.all([
        evidence.listSessionInputs({ sessionId: SESSION_ID }),
        evidence.listSessionTurns({ sessionId: SESSION_ID }),
        evidence.listSessionMessages({ sessionId: SESSION_ID })
      ])
      const jobs = await Promise.all(
        canonical.value.goal.attempts.map(async (attempt) =>
          await evidence.getJob({ jobId: attempt.jobId })
        )
      )
      const exactInputIds = new Set(
        canonical.value.goal.attempts.map((attempt) => attempt.inputId)
      )
      const exactTurnIds = new Set(
        canonical.value.goal.attempts.map((attempt) => attempt.turnId)
      )
      assert(
        inputs.length === 2 &&
          inputs.every(
            (input) =>
              exactInputIds.has(input.id) &&
              input.status === "completed" &&
              input.origin?.kind === "objective" &&
              input.origin.sourceRef === goalId
          ) &&
          turns.length === 2 &&
          turns.every(
            (turn) => exactTurnIds.has(turn.id) && turn.state === "succeeded"
          ) &&
          jobs.every(
            (job) => job?.kind === "session.turn" && job.state === "succeeded"
          ) &&
          messages.filter((message) => message.role === "user").length === 2 &&
          messages.filter((message) => message.role === "assistant").length === 2,
        "Goal attempts must remain ordinary durable Input, Turn, Job, and transcript records"
      )

      const goalInvalidations = observedEvents.filter(
        (event) => event.type === "product.surface.goal.invalidated"
      )
      const invalidationCauses = goalInvalidations.flatMap((event) =>
        event.goal === undefined ? [] : [event.goal.cause]
      )
      assert(
        invalidationCauses.join(",") ===
          [
            "created",
            "attempt_admitted",
            "paused",
            "attempt_reviewed",
            "resumed",
            "attempt_admitted",
            "attempt_reviewed"
          ].join(","),
        "Goal invalidations should remain bounded and canonically ordered"
      )
      const invalidationJson = JSON.stringify(goalInvalidations)
      assert(
        !invalidationJson.includes(OBJECTIVE) &&
          !invalidationJson.includes(MODEL_ID) &&
          !invalidationJson.includes(SECRET_REF),
        "Goal invalidations must omit Goal content and Provider evidence"
      )

      const webSnapshot = await web.reconcileEvents({ limit: 100 })
      const tuiSnapshot = await tui.refresh()
      assert(
        webSnapshot.goal.goal?.goalId === goalId &&
          webSnapshot.goal.goal.state === "succeeded" &&
          tuiSnapshot.goal.ok &&
          tuiSnapshot.goal.value.kind === "product.goal.found" &&
          tuiSnapshot.goal.value.goal.goalId === goalId &&
          tuiSnapshot.goal.value.goal.state === "succeeded",
        "Web and TUI must project the same canonical terminal Goal"
      )
      const tuiText = renderTuiGoal(tuiSnapshot.goal.value)
      assert(
        tuiText.includes(`goal:${goalId}`) &&
          tuiText.includes("verification:passed"),
        "TUI should render bounded Goal attempt and verification evidence"
      )

      const productStateJson = JSON.stringify(stateStore.snapshot())
      assert(
        !productStateJson.includes(goalId) &&
          !productStateJson.includes(OBJECTIVE) &&
          !productStateJson.includes("Independent verification"),
        "Product persistence must contain no Goal selection, content, or durable copy"
      )
      assert(
        provider.requests.map((request) => request.kind).join(",") ===
          "execution,verifier,verifier,execution,verifier",
        "App should own execution and independent verification across the pause boundary"
      )

      return {
        goalId,
        goalState: canonical.value.goal.state,
        attemptCount: canonical.value.goal.attemptCount,
        inputCount: inputs.length,
        turnCount: turns.length,
        jobCount: jobs.length,
        invalidationCauses,
        staleRevisionRejected: !stale.ok,
        webState: webSnapshot.goal.state,
        tuiState:
          tuiSnapshot.goal.ok &&
          tuiSnapshot.goal.value.kind === "product.goal.found"
            ? tuiSnapshot.goal.value.goal.state
            : "unavailable",
        opaqueProductPersistence: !productStateJson.includes(goalId)
      }
    } finally {
      provider.releaseFirstVerifier()
      unsubscribe()
      await surface.dispose()
      await evidence.dispose()
      await app.dispose()
      await closeServer(provider.server)
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

interface GoalProviderFixture {
  readonly server: Server
  readonly baseUrl: string
  readonly requests: Array<{
    readonly kind: "execution" | "verifier"
  }>
  readonly firstVerifierStarted: Promise<void>
  releaseFirstVerifier(): void
}

async function listenGoalProvider(): Promise<GoalProviderFixture> {
  const firstVerifierStarted = deferred<void>()
  const firstVerifierRelease = deferred<void>()
  const requests: GoalProviderFixture["requests"] = []
  const verifierDecisions = [
    {
      disposition: "continue",
      result: "failed",
      reason: "stale review observed before pause"
    },
    {
      disposition: "continue",
      result: "failed",
      reason: "paused attempt needs one resumed attempt"
    },
    {
      disposition: "succeeded",
      result: "passed",
      reason: "resumed Goal work is independently verified"
    }
  ] as const
  let executionCount = 0
  let verifierCount = 0
  let firstVerifierReleased = false
  const server = createServer(async (request, response) => {
    const body = await readJsonRequest(request)
    const kind = JSON.stringify(body).includes("WANEX_GOAL_VERIFIER_V1")
      ? "verifier" as const
      : "execution" as const
    requests.push({ kind })
    if (kind === "execution") {
      executionCount += 1
      writeOpenAIStream(
        response,
        `Goal execution ${String(executionCount)} completed durably`
      )
      return
    }
    if (verifierCount === 0) {
      firstVerifierStarted.resolve(undefined)
      if (!firstVerifierReleased) {
        await firstVerifierRelease.promise
      }
    }
    const decision = verifierDecisions[verifierCount]
    verifierCount += 1
    writeOpenAIStream(
      response,
      JSON.stringify(
        decision ?? {
          disposition: "continue",
          result: "inconclusive",
          reason: "fixture has no verifier decision"
        }
      )
    )
  })
  return {
    server,
    baseUrl: await listen(server),
    requests,
    firstVerifierStarted: firstVerifierStarted.promise,
    releaseFirstVerifier() {
      firstVerifierReleased = true
      firstVerifierRelease.resolve(undefined)
    }
  }
}

async function waitForGoalCause(request: {
  readonly surface: ReturnType<typeof createSurfaceAdapter>
  readonly observedEvents: readonly SurfaceEvent[]
  readonly cause: GoalInvalidationCause
  readonly occurrence: number
}): Promise<void> {
  const count = () =>
    request.observedEvents.filter(
      (event) =>
        event.type === "product.surface.goal.invalidated" &&
        event.goal?.cause === request.cause
    ).length
  if (count() >= request.occurrence) return
  await withTimeout(
    new Promise<void>((resolve) => {
      const unsubscribe = request.surface.subscribeSurfaceEvents((event) => {
        if (
          event.type === "product.surface.goal.invalidated" &&
          event.goal?.cause === request.cause &&
          count() >= request.occurrence
        ) {
          unsubscribe()
          resolve()
        }
      })
    }),
    5_000,
    `Goal invalidation did not arrive: ${request.cause}`
  )
}

async function readJsonRequest(
  request: IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >
}

function writeOpenAIStream(response: ServerResponse, content: string): void {
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
    if (timer !== undefined) clearTimeout(timer)
  }
}
