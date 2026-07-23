import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimeEvent } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  filterEventsByFamily,
  filterKnownEvents,
  nextEventCursor,
  WanexEventCore
} from "../src/events/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime internal events", () => {
  it("computes the next cursor from the last event", () => {
    const event = createRuntimeEvent({
      id: "evt_cursor",
      type: "cursor.event",
      scope: {},
      payload: {},
      occurredAt: 42
    })

    expect(nextEventCursor([event])).toEqual({
      occurredAt: 42,
      eventId: "evt_cursor"
    })
    expect(nextEventCursor([])).toBeUndefined()
  })

  it("filters known events by family", () => {
    const sessionEvent = createRuntimeEvent({
      id: "evt_session",
      type: "session.turn.succeeded",
      scope: { sessionId: "ses_1", turnId: "turn_1" },
      payload: {},
      occurredAt: 1
    })
    const schedulerEvent = createRuntimeEvent({
      id: "evt_scheduler",
      type: "scheduler.job.succeeded",
      scope: {},
      payload: {},
      occurredAt: 2
    })
    const configEvent = createRuntimeEvent({
      id: "evt_config",
      type: "config.updated",
      scope: {},
      payload: { key: "provider.profile.default", updatedAt: 3 },
      occurredAt: 3
    })
    const unknownEvent = createRuntimeEvent({
      id: "evt_unknown",
      type: "custom.future.event",
      scope: {},
      payload: {},
      occurredAt: 4
    })

    expect(
      filterEventsByFamily(
        [sessionEvent, schedulerEvent, configEvent, unknownEvent],
        "session"
      )
        .map((event) => event.id)
    ).toEqual(["evt_session"])
    expect(
      filterEventsByFamily(
        [sessionEvent, schedulerEvent, configEvent, unknownEvent],
        "config"
      ).map((event) => event.id)
    ).toEqual(["evt_config"])
    expect(
      filterKnownEvents([
        sessionEvent,
        schedulerEvent,
        configEvent,
        unknownEvent
      ]).map((event) => event.id)
    ).toEqual(["evt_session", "evt_scheduler", "evt_config"])
  })

  it("polls once and advances a stable cursor", async () => {
    const storage = await createTestStore()
    const events = new WanexEventCore({ storage })
    for (const id of ["evt_poll_a", "evt_poll_b", "evt_poll_c"]) {
      await storage.appendEvent(
        createRuntimeEvent({
          id,
          type: "poll.event",
          scope: { sessionId: "ses_poll" },
          payload: { id },
          occurredAt: 100
        })
      )
    }

    const first = await events.pollOnce({
      scope: { sessionId: "ses_poll" },
      limit: 2
    })
    expect(first.events.map((event) => event.id)).toEqual([
      "evt_poll_a",
      "evt_poll_b"
    ])
    expect(first.cursor).toEqual({
      occurredAt: 100,
      eventId: "evt_poll_b"
    })
    if (first.cursor === undefined) {
      throw new Error("expected first poll cursor")
    }

    const second = await events.pollOnce({
      scope: { sessionId: "ses_poll" },
      cursor: first.cursor,
      limit: 2
    })
    expect(second.events.map((event) => event.id)).toEqual(["evt_poll_c"])
    expect(second.cursor).toEqual({
      occurredAt: 100,
      eventId: "evt_poll_c"
    })
  })
})

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-event-core-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
}
