import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createAppExtensionCatalog,
  resolveAppExtensionContributions,
  type AppExtensionCatalogSource,
  type AppCommandContribution
} from "@wanex/extension"
import {
  createShell,
  createSurfaceAdapter
} from "../src/index.js"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "../src/surface/client.js"
import { assistantTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("Assistant command catalog events", () => {
  it("invalidates once per changed revision and requires a canonical reread", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant-catalog-event-"))
    tempDirs.push(storeDir)
    const catalog = createAppExtensionCatalog(commandGeneration("catalog-zero"))
    const source: AppExtensionCatalogSource = {
      current: () => catalog.source.current(),
      subscribe(listener) {
        listener(catalog.source.current())
        return catalog.source.subscribe(listener)
      }
    }
    const shell = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "catalog-event-model",
        modelId: "catalog-event-model"
      }),
      extensions: { source }
    })
    const surface = createSurfaceAdapter(shell, {
      now: () => 41_000,
      streamId: "assistant-command-catalog-events"
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    )
    const observed: unknown[] = []
    const unsubscribe = client.subscribeSurfaceEvents((event) => {
      observed.push(event)
    })

    try {
      const invalidations = () => observed.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "assistant.surface.command-catalog.invalidated"
      )
      const initial = await client.readAssistantCommands()
      expect(initial).toMatchObject({
        ok: true,
        value: { extensionRevision: "catalog-zero" }
      })

      const next = commandGeneration("catalog-one", "1.0.0")
      expect(catalog.publish(next).changed).toBe(true)
      expect(catalog.publish(next).changed).toBe(false)

      expect(invalidations()).toEqual([
        expect.objectContaining({
          type: "assistant.surface.command-catalog.invalidated",
          command: "readAssistantCommands",
          commandCatalog: {
            kind: "assistant.command-catalog.invalidated",
            sequence: 1,
            at: expect.any(Number),
            revision: "catalog-one"
          }
        })
      ])
      expect(JSON.stringify(invalidations())).not.toMatch(
        /catalog\.dynamic|installRoot|payload|worker|trust|secret/u
      )

      const refreshed = await client.readAssistantCommands()
      expect(refreshed).toMatchObject({
        ok: true,
        value: {
          extensionRevision: "catalog-one",
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "catalog.dynamic",
              handlerRef: expect.stringContaining("version=1.0.0")
            })
          ])
        }
      })

      catalog.publish(commandGeneration("catalog-two", "2.0.0"))
      expect(invalidations()).toHaveLength(2)
      expect(invalidations()[1]).toMatchObject({
        commandCatalog: { sequence: 2, revision: "catalog-two" }
      })
    } finally {
      unsubscribe()
      await surface.dispose()
      await shell.dispose()
    }
  })
})

function commandGeneration(revision: string, version?: string) {
  return {
    revision,
    snapshot: resolveAppExtensionContributions(
      version === undefined
        ? []
        : [{
            id: "catalog.dynamic",
            domain: "command",
            value: {
              name: "catalog.dynamic",
              title: "Dynamic catalog command",
              paletteVisibility: "visible",
              handlerRef:
                `wanex.plugin-action:catalog.dynamic/run?version=${version}`
            },
            provenance: {
              source: {
                kind: "plugin",
                scope: "user",
                id: "catalog.dynamic",
                version
              },
              trust: "user_enabled"
            },
            privileged: true
          } satisfies AppCommandContribution]
    )
  }
}
