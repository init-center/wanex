import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function createAssistantCapabilityStoreDir(
  prefix = "wanex-eval-assistant-backend-cli-"
): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
