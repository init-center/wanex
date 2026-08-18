import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createShell,
  createSurfaceAdapter,
  type CommandExecutionInvalidationListener,
  type CommandExecutionInvalidationSource,
} from "../src/index.js"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
} from "../src/surface/client.js"
import { productTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("Product command execution events", () => {
  it("invalidates one durable job reference without exposing execution details", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-command-execution-event-"))
    tempDirs.push(storeDir)
    const listeners = new Set<CommandExecutionInvalidationListener>()
    const source: CommandExecutionInvalidationSource = {
      subscribeCommandExecutionInvalidations(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const shell = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: productTestModelEndpoint({
        endpointId: "command-execution-event-model",
        modelId: "command-execution-event-model",
      }),
      productCommands: { executionInvalidations: source },
    })
    const surface = createSurfaceAdapter(shell, {
      now: () => 51_000,
      streamId: "product-command-execution-events",
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface),
    )
    const observed: unknown[] = []
    surface.subscribeSurfaceEvents(() => {
      throw new Error("isolated execution listener")
    })
    const unsubscribe = client.subscribeSurfaceEvents((event) => {
      observed.push(event)
    })

    try {
      for (const listener of listeners) {
        listener({ kind: "job", id: "job_product_execution_event" })
      }

      expect(observed).toEqual([
        expect.objectContaining({
          type: "product.surface.command-execution.invalidated",
          command: "readExecutionReference",
          commandExecution: {
            kind: "product.command-execution.invalidated",
            sequence: 1,
            at: expect.any(Number),
            reference: {
              kind: "job",
              id: "job_product_execution_event",
            },
          },
        }),
      ])
      expect(JSON.stringify(observed)).not.toMatch(
        /pluginId|version|payload|worker|result|error|path|secret/u,
      )

      const canonical = await client.readExecutionReference({
        kind: "job",
        id: "job_product_execution_event",
      })
      expect(canonical).toMatchObject({
        ok: true,
        value: {
          kind: "missing",
          reference: { kind: "job", id: "job_product_execution_event" },
        },
      })
    } finally {
      unsubscribe()
      await surface.dispose()
      await shell.dispose()
    }
  })
})
