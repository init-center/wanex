import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createShell,
  createSurfaceAdapter,
  type ScheduleDefinition,
  type ScheduleDefinitionSpec,
  type ScheduleMutationResult,
  type SchedulePort,
  type SchedulePortInvalidation,
} from "../src/index.js";
import {
  createInProcessSurfaceClientTransport,
  createMessageSurfaceClientTransport,
  createSurfaceHostEndpoint,
  createSurfaceClient,
  type SurfaceClientTransport
} from "../src/surface/client.js";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Assistant Schedule boundary", () => {
  it("stays truthful when Schedule management is not configured", async () => {
    const shell = await createAssistant();
    try {
      expect(shell.schedules.readAvailability()).toEqual({
        kind: "assistant.schedule-availability",
        state: "unavailable",
        reason: "not_configured",
        capabilities: {
          canList: false,
          canCreate: false,
          canEdit: false,
          canSetEnabled: false,
          canRemove: false,
        },
      });
      await expect(shell.schedules.listDefinitions()).resolves.toEqual({
        kind: "assistant.schedule-list",
        availability: shell.schedules.readAvailability(),
        schedules: [],
      });
      await expect(
        shell.schedules.readDefinition({ scheduleId: "schedule_daily" }),
      ).resolves.toMatchObject({
        kind: "assistant.schedule.unavailable",
        availability: { reason: "not_configured" },
      });
      await expect(
        shell.schedules.createDefinition({
          definition: {
            prompt: "Prepare a daily summary",
            trigger: { kind: "once", at: 1 },
          },
          idempotencyKey: "create-daily",
        }),
      ).resolves.toMatchObject({
        kind: "assistant.schedule.rejected",
        operation: "create",
        reason: "not_configured",
      });
      await expect(
        shell.schedules.replaceDefinition({
          scheduleId: "schedule_daily",
          expectedRevision: 1,
          definition: {
            prompt: "Prepare a daily summary",
            enabled: true,
            trigger: { kind: "once", at: 1 },
          },
        }),
      ).resolves.toMatchObject({ operation: "replace", reason: "not_configured" });
      await expect(
        shell.schedules.setEnabled({
          scheduleId: "schedule_daily",
          expectedRevision: 1,
          enabled: false,
        }),
      ).resolves.toMatchObject({ operation: "set_enabled", reason: "not_configured" });
      await expect(
        shell.schedules.removeDefinition({
          scheduleId: "schedule_daily",
          expectedRevision: 1,
        }),
      ).resolves.toMatchObject({ operation: "remove", reason: "not_configured" });
    } finally {
      await shell.dispose();
    }
  });

  it("normalizes safe actions and projects prompt-free list summaries", async () => {
    const port = new FakeSchedulePort();
    const shell = await createAssistant({ schedules: port });
    const events: unknown[] = [];
    shell.scheduleEvents.subscribeScheduleEvents(() => {
      throw new Error("isolated presentation listener");
    });
    shell.scheduleEvents.subscribeScheduleEvents((event) => events.push(event));

    try {
      expect(shell.schedules.readAvailability()).toMatchObject({
        state: "ready",
        capabilities: { canCreate: true, canRemove: true },
      });
      const listed = await shell.schedules.listDefinitions({
        cursor: " schedule_daily ",
        limit: 500,
      });
      expect(port.listRequest).toEqual({ cursor: "schedule_daily", limit: 100 });
      expect(listed).toEqual({
        kind: "assistant.schedule-list",
        availability: shell.schedules.readAvailability(),
        schedules: [
          {
            kind: "assistant.schedule-summary",
            scheduleId: "schedule_daily",
            title: "Daily brief",
            enabled: true,
            trigger: { kind: "cron", expression: "0 9 * * *", timeZone: "Asia/Shanghai" },
            revision: 3,
            updatedAt: 300,
            status: {
              kind: "assistant.schedule-status",
              scheduleId: "schedule_daily",
              definitionRevision: 3,
              state: "scheduled",
              nextAt: 86_400,
            },
          },
        ],
        nextCursor: "schedule_daily",
      });
      expect(JSON.stringify(listed)).not.toContain("Summarize private work");
      expect(JSON.stringify(listed)).not.toContain("principal-private");

      await expect(
        shell.schedules.readDefinition({ scheduleId: " schedule_daily " }),
      ).resolves.toMatchObject({
        kind: "assistant.schedule.found",
        definition: { scheduleId: "schedule_daily", prompt: "Summarize private work" },
      });
      expect(port.readScheduleId).toBe("schedule_daily");
      await expect(
        shell.schedules.readDefinition({ scheduleId: " schedule_missing " }),
      ).resolves.toEqual({
        kind: "assistant.schedule.missing",
        scheduleId: "schedule_missing",
      });

      await shell.schedules.createDefinition({
        definition: {
          title: "  Frequent check  ",
          prompt: "  Check the queue  ",
          trigger: { kind: "interval", anchorAt: 1_000, intervalMs: 1_000 },
        },
        idempotencyKey: "  create-frequent  ",
      });
      expect(port.createRequest).toEqual({
        definition: {
          title: "Frequent check",
          prompt: "Check the queue",
          enabled: true,
          trigger: { kind: "interval", anchorAt: 1_000, intervalMs: 1_000 },
          sessionPolicy: { kind: "isolated" },
          modelPolicy: { kind: "active" },
          overlapPolicy: "skip_if_running",
          misfirePolicy: "fire_once",
        },
        idempotencyKey: "create-frequent",
      });

      await shell.schedules.replaceDefinition({
        scheduleId: " schedule_daily ",
        expectedRevision: 3,
        definition: {
          prompt: "  Updated brief  ",
          enabled: false,
          trigger: {
            kind: "cron",
            expression: " 30 8 * * 1-5 ",
            timeZone: " Asia/Shanghai ",
          },
          sessionPolicy: { kind: "reuse", sessionId: " session_daily " },
          modelPolicy: { kind: "pinned", endpointId: " endpoint_daily " },
          misfirePolicy: "skip",
        },
      });
      expect(port.replaceRequest).toEqual({
        scheduleId: "schedule_daily",
        expectedRevision: 3,
        definition: {
          prompt: "Updated brief",
          enabled: false,
          trigger: {
            kind: "cron",
            expression: "30 8 * * 1-5",
            timeZone: "Asia/Shanghai",
          },
          sessionPolicy: { kind: "reuse", sessionId: "session_daily" },
          modelPolicy: { kind: "pinned", endpointId: "endpoint_daily" },
          overlapPolicy: "skip_if_running",
          misfirePolicy: "skip",
        },
      });
      await expect(
        shell.schedules.replaceDefinition({
          scheduleId: "schedule_daily",
          expectedRevision: 2,
          definition: {
            prompt: "Stale update",
            enabled: true,
            trigger: { kind: "once", at: 10_000 },
          },
        }),
      ).resolves.toEqual({
        kind: "assistant.schedule.conflict",
        operation: "replace",
        reason: "revision_conflict",
        scheduleId: "schedule_daily",
        expectedRevision: 2,
        current: port.definition,
        message: "Schedule definition changed.",
      });
      await shell.schedules.setEnabled({
        scheduleId: " schedule_daily ",
        expectedRevision: 4,
        enabled: true,
      });
      expect(port.setEnabledRequest).toEqual({
        scheduleId: "schedule_daily",
        expectedRevision: 4,
        enabled: true,
      });
      await shell.schedules.removeDefinition({
        scheduleId: " schedule_daily ",
        expectedRevision: 5,
      });
      expect(port.removeRequest).toEqual({
        scheduleId: "schedule_daily",
        expectedRevision: 5,
      });

      port.emit({ at: 9_000, revision: 6 });
      expect(events).toEqual([
        {
          kind: "assistant.schedule.invalidated",
          sequence: 1,
          at: 9_000,
          revision: 6,
        },
      ]);
      expect(JSON.stringify(events)).not.toContain("schedule_daily");
      expect(JSON.stringify(events)).not.toContain("prompt");
    } finally {
      await shell.dispose();
    }
    expect(port.unsubscribeCount).toBe(1);
    port.emit({ at: 9_001, revision: 7 });
    expect(events).toHaveLength(1);
  });

  it("rejects unsafe or ambiguous schedule definitions before the port", async () => {
    const port = new FakeSchedulePort();
    const shell = await createAssistant({ schedules: port });
    try {
      await expect(
        shell.schedules.createDefinition({
          definition: {
            prompt: "Too frequent",
            trigger: { kind: "interval", anchorAt: 0, intervalMs: 999 },
          },
          idempotencyKey: "too-frequent",
        }),
      ).rejects.toThrow("intervalMs must be at least 1000");
      await expect(
        shell.schedules.createDefinition({
          definition: {
            prompt: "Cron",
            trigger: { kind: "cron", expression: " ", timeZone: "UTC" },
          },
          idempotencyKey: "bad-cron",
        }),
      ).rejects.toThrow("cron expression must not be empty");
      await expect(
        shell.schedules.replaceDefinition({
          scheduleId: "schedule_daily",
          expectedRevision: 1,
          definition: {
            prompt: "Missing enabled",
            trigger: { kind: "once", at: 1 },
          } as never,
        }),
      ).rejects.toThrow("enabled must be an explicit boolean");
      await expect(
        shell.schedules.setEnabled({
          scheduleId: "schedule_daily",
          expectedRevision: 0,
          enabled: true,
        }),
      ).rejects.toThrow("schedule revision must be a positive safe integer");
      expect(port.createRequest).toBeUndefined();
      expect(port.replaceRequest).toBeUndefined();
      expect(port.setEnabledRequest).toBeUndefined();
    } finally {
      await shell.dispose();
    }
  });

  it("exposes Schedule only through the strict Surface contract", async () => {
    const port = new FakeSchedulePort();
    const shell = await createAssistant({ schedules: port });
    const surface = createSurfaceAdapter(shell, {
      now: () => 9_000,
      streamId: "schedule-surface"
    });
    const transport = createInProcessSurfaceClientTransport(surface);
    const client = createSurfaceClient(transport);
    try {
      const descriptor = await client.descriptor();
      expect(descriptor).toMatchObject({ ok: true });
      if (descriptor.ok) {
        for (const expected of [
          ["listSchedules", "schedule-list"],
          ["readSchedule", "schedule-read"],
          ["createSchedule", "schedule-create"],
          ["replaceSchedule", "schedule-replace"],
          ["setScheduleEnabled", "schedule-enabled"],
          ["removeSchedule", "schedule-remove"]
        ] as const) {
          expect(descriptor.value.commands).toContainEqual(
            expect.objectContaining({ command: expected[0], input: expected[1] })
          );
        }
      }

      await expect(client.listSchedules({ limit: 500 })).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "assistant.schedule-list",
          schedules: [{
            scheduleId: "schedule_daily",
            status: { state: "scheduled", nextAt: 86_400 }
          }]
        }
      });
      expect(port.listRequest).toEqual({ limit: 100 });

      await expect(client.readSchedule({ scheduleId: "schedule_daily" })).resolves
        .toMatchObject({
          ok: true,
          value: {
            kind: "assistant.schedule.found",
            definition: { scheduleId: "schedule_daily" },
            status: { definitionRevision: 3 }
          }
        });
      await expect(surface.dispatchSurfaceCommand({
        command: "readSchedule",
        input: { scheduleId: "schedule_daily", prompt: "not accepted" }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("prompt")
        }
      });

      await expect(client.createSchedule({
        definition: {
          title: "Queue check",
          prompt: "Check the queue",
          trigger: { kind: "interval", anchorAt: 1_000, intervalMs: 60_000 }
        },
        idempotencyKey: "surface-create"
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.schedule.applied", operation: "create" }
      });
      expect(port.createRequest).toMatchObject({
        definition: {
          title: "Queue check",
          prompt: "Check the queue",
          enabled: true,
          overlapPolicy: "skip_if_running"
        },
        idempotencyKey: "surface-create"
      });

      await expect(client.replaceSchedule({
        scheduleId: "schedule_daily",
        expectedRevision: 3,
        definition: {
          prompt: "Updated brief",
          enabled: false,
          trigger: { kind: "once", at: 100_000 }
        }
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.schedule.applied", operation: "replace" }
      });
      await expect(client.setScheduleEnabled({
        scheduleId: "schedule_daily",
        expectedRevision: 3,
        enabled: false
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.schedule.applied", operation: "set_enabled" }
      });
      await expect(client.removeSchedule({
        scheduleId: "schedule_daily",
        expectedRevision: 3
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "assistant.schedule.applied", operation: "remove" }
      });

      await expect(surface.dispatchSurfaceCommand({
        command: "createSchedule",
        input: {
          definition: {
            prompt: "forged policy",
            trigger: { kind: "once", at: 1 },
            overlapPolicy: "parallel"
          },
          idempotencyKey: "unsafe"
        }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("overlapPolicy")
        }
      });
      await expect(surface.dispatchSurfaceCommand({
        command: "replaceSchedule",
        input: {
          scheduleId: "schedule_daily",
          expectedRevision: 3,
          definition: {
            prompt: "missing enabled",
            trigger: { kind: "once", at: 1 }
          }
        }
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error",
          message: expect.stringContaining("enabled")
        }
      });

      port.emit({ at: 9_001, revision: 4 });
      expect(surface.readSurfaceEvents().events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "assistant.surface.schedule.invalidated",
            command: "listSchedules",
            schedule: {
              kind: "assistant.schedule.invalidated",
              sequence: 1,
              at: 9_001,
              revision: 4
            }
          })
        ])
      );
      const scheduleEvents = surface.readSurfaceEvents().events.filter(
        (event) => event.type === "assistant.surface.schedule.invalidated"
      );
      expect(JSON.stringify(scheduleEvents)).not.toContain("prompt");

      const forged = createSurfaceClient({
        ...transport,
        async dispatchSurfaceCommand(request) {
          const response = await transport.dispatchSurfaceCommand(request);
          if (request.command !== "listSchedules" || !response.ok) return response;
          const value = structuredClone(response.value) as Record<string, any>;
          value.schedules[0].prompt = "private prompt must not cross validator";
          return { ...response, value };
        }
      } satisfies SurfaceClientTransport);
      await expect(forged.listSchedules()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_transport_response" }
      });

      const host = createSurfaceHostEndpoint({ surface });
      const messageClient = createSurfaceClient(
        createMessageSurfaceClientTransport({
          send: (request) => host.send(request),
          subscribe: (listener) => host.subscribe(listener)
        })
      );
      await expect(messageClient.readSchedule({ scheduleId: "schedule_daily" }))
        .resolves.toMatchObject({
          ok: true,
          value: { kind: "assistant.schedule.found" }
        });
    } finally {
      await surface.dispose();
      await shell.dispose();
    }
  });
});

class FakeSchedulePort implements SchedulePort {
  readonly definition = scheduleDefinition();
  listRequest: unknown;
  readScheduleId: string | undefined;
  readStatusIds: string[] = [];
  createRequest: unknown;
  replaceRequest: unknown;
  setEnabledRequest: unknown;
  removeRequest: unknown;
  unsubscribeCount = 0;
  #listener: ((event: SchedulePortInvalidation) => void) | undefined;

  async listDefinitions(request: { readonly cursor?: string; readonly limit: number }) {
    this.listRequest = request;
    return {
      definitions: [{ ...this.definition, principalId: "principal-private" }],
      nextCursor: " schedule_daily ",
    } as never;
  }

  async readDefinition(scheduleId: string) {
    this.readScheduleId = scheduleId;
    return scheduleId === this.definition.scheduleId ? this.definition : null;
  }

  async readStatus(scheduleId: string) {
    this.readStatusIds.push(scheduleId);
    return scheduleId === this.definition.scheduleId
      ? {
          kind: "assistant.schedule-status" as const,
          scheduleId,
          definitionRevision: this.definition.revision,
          state: "scheduled" as const,
          nextAt: 86_400,
        }
      : null;
  }

  async createDefinition(request: {
    readonly definition: ScheduleDefinitionSpec;
    readonly idempotencyKey: string;
  }): Promise<ScheduleMutationResult> {
    this.createRequest = request;
    return {
      kind: "assistant.schedule.applied",
      operation: "create",
      definition: { ...this.definition, ...request.definition },
    };
  }

  async replaceDefinition(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
    readonly definition: ScheduleDefinitionSpec;
  }): Promise<ScheduleMutationResult> {
    this.replaceRequest = request;
    if (request.expectedRevision !== this.definition.revision) {
      return {
        kind: "assistant.schedule.conflict",
        operation: "replace",
        reason: "revision_conflict",
        scheduleId: request.scheduleId,
        expectedRevision: request.expectedRevision,
        current: this.definition,
        message: "Schedule definition changed.",
      };
    }
    return {
      kind: "assistant.schedule.applied",
      operation: "replace",
      definition: {
        ...this.definition,
        ...request.definition,
        revision: request.expectedRevision + 1,
      },
    };
  }

  async setEnabled(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
    readonly enabled: boolean;
  }): Promise<ScheduleMutationResult> {
    this.setEnabledRequest = request;
    return {
      kind: "assistant.schedule.applied",
      operation: "set_enabled",
      definition: {
        ...this.definition,
        enabled: request.enabled,
        revision: request.expectedRevision + 1,
      },
    };
  }

  async removeDefinition(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
  }): Promise<ScheduleMutationResult> {
    this.removeRequest = request;
    return {
      kind: "assistant.schedule.applied",
      operation: "remove",
      scheduleId: request.scheduleId,
      revision: request.expectedRevision + 1,
    };
  }

  subscribeInvalidations(listener: (event: SchedulePortInvalidation) => void) {
    this.#listener = listener;
    return () => {
      this.unsubscribeCount += 1;
      this.#listener = undefined;
    };
  }

  emit(event: SchedulePortInvalidation): void {
    this.#listener?.(event);
  }
}

function scheduleDefinition(): ScheduleDefinition {
  return {
    kind: "assistant.schedule-definition",
    scheduleId: "schedule_daily",
    title: "Daily brief",
    prompt: "Summarize private work",
    enabled: true,
    trigger: {
      kind: "cron",
      expression: "0 9 * * *",
      timeZone: "Asia/Shanghai",
    },
    sessionPolicy: { kind: "isolated" },
    modelPolicy: { kind: "active" },
    overlapPolicy: "skip_if_running",
    misfirePolicy: "fire_once",
    revision: 3,
    createdAt: 100,
    updatedAt: 300,
  };
}

async function createAssistant(
  options: Partial<Parameters<typeof createShell>[0]> = {},
) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant-schedule-"));
  tempDirs.push(storeDir);
  return await createShell({
    storage: { kind: "local-system-service", storeDir },
    artifacts: { explicitPath: serviceBin },
    ...options,
  });
}
