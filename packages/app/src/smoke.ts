import { createWanexAppShell } from "./app.js"
import type {
  WanexAppShellSmokeRequest,
  WanexAppShellSmokeResult
} from "./types-smoke.js"

export async function runWanexAppShellSmoke(
  request: WanexAppShellSmokeRequest
): Promise<WanexAppShellSmokeResult> {
  const app = await createWanexAppShell(request)
  try {
    const run = await app.commands.runAgentTurn({
      text: request.text ?? "hello from app shell",
      sessionId: "ses_app_shell_smoke"
    })
    const diagnostics = await app.commands.readDiagnostics({
      now: 3_456
    })
    const provider = await app.commands.readActiveProviderProfile()
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
