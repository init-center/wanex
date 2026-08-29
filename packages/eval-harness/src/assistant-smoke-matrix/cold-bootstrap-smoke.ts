import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { bootstrapWanexStorage } from "@wanex/runtime/bootstrap"
import { buildSupportBundle } from "@wanex/app/diagnostics"
import { createPluginStore } from "@wanex/storage/plugin"

export async function runColdBootstrapSmoke(
  serviceBin: string
): Promise<{
  readonly doctorOk: boolean
  readonly artifactSource: string | null
  readonly supportBundleOk: boolean
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant-matrix-cold-"))
  const runtime = await bootstrapWanexStorage({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: {
      explicitPath: serviceBin
    }
  })
  try {
    const [doctor, support] = await Promise.all([
      runtime.storage.doctor(),
      buildSupportBundle({
        storage: Object.assign(
          {},
          runtime.storage,
          createPluginStore(runtime.transport)
        ),
        modelEndpointIds: [],
        eventLimit: 5,
        jobLimit: 5,
        pluginLimit: 5,
        now: 1_234
      })
    ])
    return {
      doctorOk:
        Number.isInteger(doctor.schemaVersion) &&
        doctor.checks.every((check) => check.state !== "error"),
      artifactSource: runtime.artifacts.systemService?.source ?? null,
      supportBundleOk:
        support.doctor.checks.every((check) => check.state !== "error") &&
        support.generatedAt === 1_234
    }
  } finally {
    await runtime.dispose()
    await rm(storeDir, { recursive: true, force: true })
  }
}
