import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "../src/index.js"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "../src/surface-client.js"

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

describe("product app execution activity surface", () => {
  it("resolves bounded job activity through shell, surface, and client", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-app-ref-"))
    tempDirs.push(storeDir)
    const app = await createProductAppShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })
    const surface = createProductAppSurfaceAdapter(app)
    const client = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(surface)
    )

    try {
      await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "product app reference",
          sessionId: "ses_product_app_reference",
          jobId: "job_product_app_reference"
        }
      })

      await waitForJob(app, "job_product_app_reference")

      await expect(
        app.readExecutionReference({
          kind: "job",
          id: "job_product_app_reference"
        })
      ).resolves.toMatchObject({
        kind: "found",
        activity: { jobKind: "session.turn", state: "succeeded" }
      })

      const found = await client.readExecutionReference(
        { kind: "job", id: "job_product_app_reference" },
        { requestId: "req_execution_reference" }
      )
      expect(found).toMatchObject({
        ok: true,
        command: "readExecutionReference",
        value: {
          kind: "found",
          reference: { kind: "job", id: "job_product_app_reference" },
          activity: {
            kind: "wanex-app.execution.job",
            jobKind: "session.turn",
            state: "succeeded"
          }
        },
        event: { requestId: "req_execution_reference" }
      })
      await expect(
        client.readExecutionReference({ kind: "job", id: "job_missing" })
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "missing",
          reference: { kind: "job", id: "job_missing" }
        }
      })
      await expect(
        client.readExecutionReference({ kind: "resource", id: "res_1" })
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "unsupported",
          reference: { kind: "resource", id: "res_1" }
        }
      })

      const serialized = JSON.stringify(found)
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("payload")
      expect(serialized).not.toContain("lastError")
      expect(serialized).not.toContain("leaseToken")
    } finally {
      await app.dispose()
    }
  })

  it("rejects malformed execution reference surface input", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-app-ref-"))
    tempDirs.push(storeDir)
    const app = await createProductAppShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })

    try {
      const surface = createProductAppSurfaceAdapter(app)
      await expect(
        surface.dispatchSurfaceCommand({
          command: "readExecutionReference",
          input: { kind: "job", id: "" }
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readExecutionReference",
        error: {
          code: "validation_error",
          category: "validation"
        }
      })
    } finally {
      await app.dispose()
    }
  })
})

async function waitForJob(
  app: Awaited<ReturnType<typeof createProductAppShell>>,
  jobId: string
): Promise<void> {
  for (;;) {
    const result = await app.readExecutionReference({ kind: "job", id: jobId })
    if (
      result.kind === "found" &&
      (result.activity.state === "succeeded" ||
        result.activity.state === "failed" ||
        result.activity.state === "cancelled")
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
