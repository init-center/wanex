import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBackendShell } from "../../src/backend/index.js"
import { assistantTestModelEndpoint } from "../model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("application backend execution reference", () => {
  it("passes the bounded wanex-app reader through the backend shell", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant.backend-ref-"))
    tempDirs.push(storeDir)
    const backend = await createBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-backend-reference",
        modelId: "assistant-backend-reference-model"
      })
    })

    try {
      const receipt = await backend.commands.submitConversationOperation({
        content: [{ type: "text", text: "application backend reference" }],
        sessionId: "ses_assistant_app_backend_reference",
        jobId: "job_assistant_app_backend_reference"
      })
      await waitForConversationTerminal(backend, receipt)
      const result = await backend.commands.readExecutionReference({
        kind: "job",
        id: "job_assistant_app_backend_reference"
      })

      expect(result).toMatchObject({
        kind: "found",
        reference: { kind: "job", id: "job_assistant_app_backend_reference" },
        activity: {
          kind: "wanex-app.execution.job",
          jobKind: "session.turn",
          state: "succeeded"
        }
      })
      expect(JSON.stringify(result)).not.toContain(storeDir)
    } finally {
      await backend.dispose()
    }
  })
})

async function waitForConversationTerminal(
  backend: Awaited<ReturnType<typeof createBackendShell>>,
  reference: {
    readonly sessionId: string
    readonly inputId: string
    readonly turnId: string
    readonly jobId: string
  }
): Promise<void> {
  for (;;) {
    const result = await backend.commands.readConversationOperation(reference)
    if (
      result.kind === "found" &&
      !["queued", "running", "cancel_requested"].includes(
        result.operation.state
      )
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
