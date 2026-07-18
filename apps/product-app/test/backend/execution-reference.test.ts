import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createProductAppBackendShell } from "../../src/backend/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../../target/debug/wanex-system-service"
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("product app backend execution reference", () => {
  it("passes the bounded app-shell reader through the backend shell", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-app.backend-ref-"))
    tempDirs.push(storeDir)
    const backend = await createProductAppBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })

    try {
      await backend.commands.runAgentTurn({
        text: "product app backend reference",
        sessionId: "ses_product_app_backend_reference",
        jobId: "job_product_app_backend_reference"
      })
      const result = await backend.commands.readExecutionReference({
        kind: "job",
        id: "job_product_app_backend_reference"
      })

      expect(result).toMatchObject({
        kind: "found",
        reference: { kind: "job", id: "job_product_app_backend_reference" },
        activity: {
          kind: "app-shell.execution.job",
          jobKind: "session.run",
          state: "succeeded"
        }
      })
      expect(JSON.stringify(result)).not.toContain(storeDir)
    } finally {
      await backend.dispose()
    }
  })
})
