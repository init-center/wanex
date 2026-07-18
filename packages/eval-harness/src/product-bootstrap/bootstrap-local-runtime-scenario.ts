import { rm } from "node:fs/promises"
import { buildAppDiagnosticsSnapshot } from "@wanex/app/diagnostics"
import { bootstrapWanexStorage } from "@wanex/runtime/bootstrap"
import { createPluginStore } from "@wanex/storage/plugin"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "./helpers.js"

export const bootstrapLocalRuntimeOperationalScenario = createEvalScenario({
  id: "bootstrap.local-runtime-operational",
  title: "App bootstrap resolves artifacts and opens local storage explicitly",
  tags: ["bootstrap", "distribution", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-bootstrap-local-")
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      }
    })

    try {
      const plugin = createPluginStore(runtime.transport)
      const doctor = await runtime.storage.doctor()
      const jobs = await runtime.storage.listJobs({ limit: 50 })
      const manifests = await plugin.listPluginManifests({ limit: 50 })
      const installs = await plugin.listPluginInstalls({ limit: 50 })
      const diagnostics = buildAppDiagnosticsSnapshot({
        jobs,
        plugin: {
          manifests,
          installs
        },
        now: 123
      })
      assert(
        runtime.artifacts.systemService?.path === context.serviceBin,
        "bootstrap should resolve the eval system-service binary"
      )
      return {
        schemaVersion: doctor.schemaVersion,
        artifactSource: runtime.artifacts.systemService?.source,
        diagnosticsGeneratedAt: diagnostics.generatedAt
      }
    } finally {
      await runtime.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
