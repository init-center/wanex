import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexAppShell } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app schedule commands", () => {
  it("submits scheduled ticks as normal session runs with scheduler provenance", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "schedule-profile",
        modelId: "schedule-model"
      }
    })

    try {
      const result = await app.commands.submitScheduledTick({
        scheduleId: "schedule_app_shell_minutely",
        tickId: "tick_0001",
        text: "scheduled app shell work",
        sessionId: "ses_app_shell_schedule",
        inputId: "inp_app_shell_schedule_tick_1",
        jobId: "job_app_shell_schedule_tick_1",
        idempotencyKey: "app-shell-schedule-input",
        jobIdempotencyKey: "app-shell-schedule-job",
        nonOverlap: true,
        classifier: {
          classifierId: "schedule-intent-v1",
          label: "maintenance",
          confidence: 0.8
        }
      })

      expect(result).toMatchObject({
        status: "submitted",
        scheduleId: "schedule_app_shell_minutely",
        tickId: "tick_0001",
        sessionId: "ses_app_shell_schedule",
        inputId: "inp_app_shell_schedule_tick_1",
        jobId: "job_app_shell_schedule_tick_1",
        providerProfileId: "schedule-profile",
        assistantText: "Fake response from schedule-model",
        jobStatuses: ["succeeded"]
      })
      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_app_shell_schedule"
        })
      ).resolves.toEqual({
        sessionId: "ses_app_shell_schedule",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            inputId: "inp_app_shell_schedule_tick_1",
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_app_shell_minutely",
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
      await app.dispose()
    }
  })

  it("skips scheduled ticks when the explicit previous job is still active", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_app_shell_schedule_previous",
        title: "previous scheduled work",
        kind: "agent"
      })
      await storage.submitSessionRun({
        id: "inp_app_shell_schedule_previous",
        sessionId: "ses_app_shell_schedule_previous",
        jobId: "job_app_shell_schedule_previous",
        principalId: "principal_schedule",
        idempotencyKey: "app-shell-schedule-previous-input",
        jobIdempotencyKey: "app-shell-schedule-previous-job",
        content: [
          {
            type: "text",
            id: "scheduled_prompt",
            text: "previous scheduled work"
          }
        ],
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_app_shell_previous",
          metadata: {
            scheduleId: "schedule_app_shell_previous",
            tickId: "tick_previous",
            nonOverlap: true
          }
        },
        intent: "normal",
        mode: "once",
        maxSteps: 1
      })

      await expect(
        app.commands.submitScheduledTick({
          scheduleId: "schedule_app_shell_previous",
          tickId: "tick_next",
          text: "next scheduled work",
          sessionId: "ses_app_shell_schedule_previous",
          nonOverlap: true,
          previousJobId: "job_app_shell_schedule_previous"
        })
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "previous_job_active",
        scheduleId: "schedule_app_shell_previous",
        tickId: "tick_next",
        previousJob: {
          jobId: "job_app_shell_schedule_previous",
          state: "ready",
          kind: "session.run"
        }
      })

      await storage.cancelJob({
        jobId: "job_app_shell_schedule_previous",
        reason: "app-shell schedule test cleanup"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("skips scheduled ticks by scanning active jobs for the same schedule", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_app_shell_schedule_scan",
        title: "scanned scheduled work",
        kind: "agent"
      })
      await storage.submitSessionRun({
        id: "inp_app_shell_schedule_scan_previous",
        sessionId: "ses_app_shell_schedule_scan",
        jobId: "job_app_shell_schedule_scan_previous",
        principalId: "principal_schedule",
        idempotencyKey: "app-shell-schedule-scan-previous-input",
        jobIdempotencyKey: "app-shell-schedule-scan-previous-job",
        content: [
          {
            type: "text",
            id: "scheduled_prompt",
            text: "previous scanned scheduled work"
          }
        ],
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_app_shell_scan",
          metadata: {
            scheduleId: "schedule_app_shell_scan",
            tickId: "tick_previous",
            nonOverlap: true
          }
        },
        intent: "normal",
        mode: "once",
        maxSteps: 1
      })

      await expect(
        app.commands.submitScheduledTick({
          scheduleId: "schedule_app_shell_scan",
          tickId: "tick_next",
          text: "next scanned scheduled work",
          sessionId: "ses_app_shell_schedule_scan",
          nonOverlap: true,
          activeJobScanLimit: 20
        })
      ).resolves.toMatchObject({
        status: "skipped",
        reason: "previous_job_active",
        scheduleId: "schedule_app_shell_scan",
        tickId: "tick_next",
        previousJob: {
          jobId: "job_app_shell_schedule_scan_previous",
          state: "ready",
          kind: "session.run"
        }
      })

      await storage.cancelJob({
        jobId: "job_app_shell_schedule_scan_previous",
        reason: "app-shell schedule scan test cleanup"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("wraps schedule validation errors in safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
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
