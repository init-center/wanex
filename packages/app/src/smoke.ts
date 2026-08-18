import { createWanexApp } from "./app.js"
import type {
  WanexAppSmokeRequest,
  WanexAppSmokeResult
} from "./types-smoke.js"

export async function runWanexAppSmoke(
  request: WanexAppSmokeRequest
): Promise<WanexAppSmokeResult> {
  const app = await createWanexApp(request)
  try {
    const run = await app.commands.runAgentTurn({
      content: [{ type: "text", text: request.text ?? "hello from app" }],
      sessionId: "ses_wanex_app_smoke"
    })
    const diagnostics = await app.commands.readDiagnostics({
      now: 3_456
    })
    const provider = await app.commands.readActiveModelEndpoint()
    if (provider === null) {
      throw new Error("Wanex App smoke requires an active model endpoint")
    }
    const provenance = await app.commands.readSessionInputProvenance({
      sessionId: run.sessionId
    })
    const shutdown = await app.commands.shutdown()
    return {
      run,
      diagnostics,
      provider,
      provenance,
      shutdown
    }
  } finally {
    await app.dispose()
  }
}
