import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { submitTestTurn } from "./durable-turn-test-fixture.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const fakeModelEndpoint = appTestModelEndpoint()

describe("@wanex/app schedule commands", () => {
  it("submits scheduled ticks as normal session turns with scheduler provenance", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "schedule-endpoint",
        modelId: "schedule-model"
      })
    })
    await app.stop()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      const result = await app.commands.submitScheduledTick({
        scheduleId: "schedule_wanex_app_minutely",
        tickId: "tick_0001",
        text: "scheduled app work",
        sessionId: "ses_wanex_app_schedule",
        inputId: "inp_wanex_app_schedule_tick_1",
        jobId: "job_wanex_app_schedule_tick_1",
        idempotencyKey: "wanex-app-schedule-input",
        jobIdempotencyKey: "wanex-app-schedule-job",
        nonOverlap: true,
        classifier: {
          classifierId: "schedule-intent-v1",
          label: "maintenance",
          confidence: 0.8
        }
      })

      expect(result).toMatchObject({
        status: "submitted",
        scheduleId: "schedule_wanex_app_minutely",
        tickId: "tick_0001",
        modelEndpointId: "schedule-endpoint",
        receipt: {
          sessionId: "ses_wanex_app_schedule",
          inputId: "inp_wanex_app_schedule_tick_1",
          jobId: "job_wanex_app_schedule_tick_1",
          state: "queued"
        }
      })
      expect(result).not.toHaveProperty("assistantText")
      if (result.status !== "submitted") {
        throw new Error("expected scheduled tick admission")
      }
      await expect(
        app.commands.readConversationOperation(result.receipt)
      ).resolves.toMatchObject({
        kind: "found",
        operation: {
          state: "queued"
        }
      })
      await expect(
        storage.getJob({ jobId: result.receipt.jobId })
      ).resolves.toMatchObject({
        id: "job_wanex_app_schedule_tick_1",
        state: "ready"
      })
      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_wanex_app_schedule"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_schedule",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            inputId: "inp_wanex_app_schedule_tick_1",
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_wanex_app_minutely",
            intent: "normal",
            metadataKeys: [
              "classifierConfidence",
              "classifierId",
              "classifierLabel",
              "nonOverlap",
              "scheduleId",
              "tickId"
            ]
          })
        ]
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("skips scheduled ticks when the explicit previous job is still active", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint
    })
    await app.stop()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_wanex_app_schedule_previous",
        title: "previous scheduled work",
        kind: "agent"
      })
      await submitTestTurn(storage, {
        id: "inp_wanex_app_schedule_previous",
        turnId: "turn_wanex_app_schedule_previous",
        sessionId: "ses_wanex_app_schedule_previous",
        jobId: "job_wanex_app_schedule_previous",
        principalId: "principal_schedule",
        idempotencyKey: "wanex-app-schedule-previous-input",
        jobIdempotencyKey: "wanex-app-schedule-previous-job",
        content: [
          {
            type: "text",
            id: "scheduled_prompt",
            text: "previous scheduled work"
          }
        ],
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_wanex_app_previous",
          metadata: {
            scheduleId: "schedule_wanex_app_previous",
            tickId: "tick_previous",
            nonOverlap: true
          }
        },
        intent: "normal",
        maxSteps: 1
      })

      await expect(
        app.commands.submitScheduledTick({
          scheduleId: "schedule_wanex_app_previous",
          tickId: "tick_next",
          text: "next scheduled work",
          sessionId: "ses_wanex_app_schedule_previous",
          nonOverlap: true,
          previousJobId: "job_wanex_app_schedule_previous"
        })
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "previous_job_active",
        scheduleId: "schedule_wanex_app_previous",
        tickId: "tick_next",
        previousJob: {
          jobId: "job_wanex_app_schedule_previous",
          state: "ready",
          kind: "session.turn"
        }
      })

      await storage.requestSessionTurnCancel({
        sessionId: "ses_wanex_app_schedule_previous",
        turnId: "turn_wanex_app_schedule_previous",
        inputId: "inp_wanex_app_schedule_previous",
        jobId: "job_wanex_app_schedule_previous",
        reason: "wanex-app schedule test cleanup"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("skips scheduled ticks by scanning active jobs for the same schedule", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint
    })
    await app.stop()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_wanex_app_schedule_scan",
        title: "scanned scheduled work",
        kind: "agent"
      })
      await submitTestTurn(storage, {
        id: "inp_wanex_app_schedule_scan_previous",
        turnId: "turn_wanex_app_schedule_scan_previous",
        sessionId: "ses_wanex_app_schedule_scan",
        jobId: "job_wanex_app_schedule_scan_previous",
        principalId: "principal_schedule",
        idempotencyKey: "wanex-app-schedule-scan-previous-input",
        jobIdempotencyKey: "wanex-app-schedule-scan-previous-job",
        content: [
          {
            type: "text",
            id: "scheduled_prompt",
            text: "previous scanned scheduled work"
          }
        ],
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_wanex_app_scan",
          metadata: {
            scheduleId: "schedule_wanex_app_scan",
            tickId: "tick_previous",
            nonOverlap: true
          }
        },
        intent: "normal",
        maxSteps: 1
      })

      await expect(
        app.commands.submitScheduledTick({
          scheduleId: "schedule_wanex_app_scan",
          tickId: "tick_next",
          text: "next scanned scheduled work",
          sessionId: "ses_wanex_app_schedule_scan",
          nonOverlap: true,
          activeJobScanLimit: 20
        })
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "previous_job_active",
        scheduleId: "schedule_wanex_app_scan",
        tickId: "tick_next",
        previousJob: {
          jobId: "job_wanex_app_schedule_scan_previous",
          state: "ready",
          kind: "session.turn"
        }
      })

      await storage.requestSessionTurnCancel({
        sessionId: "ses_wanex_app_schedule_scan",
        turnId: "turn_wanex_app_schedule_scan_previous",
        inputId: "inp_wanex_app_schedule_scan_previous",
        jobId: "job_wanex_app_schedule_scan_previous",
        reason: "wanex-app schedule scan test cleanup"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("wraps schedule validation errors in safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint
    })

    try {
      await expect(
        app.commands.safeCommand({
          command: "submitScheduledTick",
          run: () =>
            app.commands.submitScheduledTick({
              scheduleId: "   ",
              tickId: "tick_1",
              text: "work"
            })
        })
      ).resolves.toEqual({
        ok: false,
        command: "submitScheduledTick",
        error: {
          code: "validation_error",
          category: "validation",
          message: "schedule id must not be empty"
        }
      })
      await expect(
        app.commands.safeCommand({
          command: "submitScheduledTick",
          run: () =>
            app.commands.submitScheduledTick({
              scheduleId: "schedule_bad_classifier",
              tickId: "tick_1",
              text: "work",
              classifier: {
                classifierId: "classifier",
                label: "bad",
                confidence: 1.2
              }
            })
        })
      ).resolves.toEqual({
        ok: false,
        command: "submitScheduledTick",
        error: {
          code: "validation_error",
          category: "validation",
          message: "schedule classifier confidence must be between 0 and 1"
        }
      })
    } finally {
      await app.dispose()
    }
  })
})
