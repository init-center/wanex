import type { PluginActionSubmission, PluginCapability, PluginInstallRecord, PluginInstallState, PluginManifestRecord, PluginManifestState } from "@wanex/protocol"
import type { PluginRuntimeStore } from "./storage.js"
import { createTrustedSubprocessPluginActionHostFromInstall } from "./actions.js"
import { expectJsonValue } from "./internal-validation.js"
import {
  isPluginInstallPlan,
  pluginInstallPlanFromJson,
  pluginPackageTrustRecordFromInstallPlan,
  registerPluginManifestRequestFromPackageLayout
} from "./codec.js"
import type { PluginActionHost, RegisterPluginInstallPlanRequest, RegisterPluginInstallPlanResult, RegisterPluginManifestRequest, SubmitPluginActionRequest, PluginRuntimeOptions } from "./types.js"

export class PluginRuntime {
  private readonly storage: PluginRuntimeStore

  constructor(options: PluginRuntimeOptions) {
    this.storage = options.storage
  }

  async registerManifest(
    request: RegisterPluginManifestRequest
  ): Promise<PluginManifestRecord> {
    return await this.storage.putPluginManifest({
      ...(request.id === undefined ? {} : { id: request.id }),
      pluginId: request.pluginId,
      version: request.version,
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.entry === undefined ? {} : { entry: request.entry }),
      capabilities: request.capabilities,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async getManifest(
    pluginId: string,
    version?: string
  ): Promise<PluginManifestRecord | null> {
    return await this.storage.getPluginManifest({
      pluginId,
      ...(version === undefined ? {} : { version })
    })
  }

  async listManifests(
    request: {
      readonly state?: PluginManifestState
      readonly capability?: PluginCapability
      readonly limit?: number
    } = {}
  ): Promise<PluginManifestRecord[]> {
    return await this.storage.listPluginManifests({
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.capability === undefined
        ? {}
        : { capability: request.capability }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async updateManifestState(
    pluginId: string,
    state: PluginManifestState,
    version?: string
  ): Promise<PluginManifestRecord> {
    return await this.storage.updatePluginManifestState({
      pluginId,
      state,
      ...(version === undefined ? {} : { version })
    })
  }

  async updateInstallState(
    pluginId: string,
    state: PluginInstallState,
    version?: string
  ): Promise<PluginInstallRecord> {
    return await this.storage.updatePluginInstallState({
      pluginId,
      state,
      ...(version === undefined ? {} : { version })
    })
  }

  async createTrustedSubprocessActionHost(
    pluginId: string,
    version?: string
  ): Promise<PluginActionHost> {
    const manifest = await this.getManifest(pluginId, version)
    if (manifest === null) {
      throw new Error(`plugin manifest not found: ${pluginId}`)
    }
    const install = await this.storage.getPluginInstall({
      pluginId,
      ...(version === undefined ? {} : { version })
    })
    if (install === null) {
      throw new Error(`plugin install not found: ${pluginId}`)
    }
    return createTrustedSubprocessPluginActionHostFromInstall({
      manifest,
      install
    })
  }

  async registerInstallPlan(
    request: RegisterPluginInstallPlanRequest
  ): Promise<RegisterPluginInstallPlanResult> {
    const plan = isPluginInstallPlan(request.plan)
      ? request.plan
      : pluginInstallPlanFromJson(request.plan)
    const manifestRequest = registerPluginManifestRequestFromPackageLayout(plan.layout)
    const trust = pluginPackageTrustRecordFromInstallPlan(plan)
    const manifestIdempotencyKey =
      request.manifestIdempotencyKey ?? manifestRequest.idempotencyKey
    const manifest = await this.registerManifest({
      ...manifestRequest,
      ...(request.manifestId === undefined ? {} : { id: request.manifestId }),
      ...(manifestIdempotencyKey === undefined
        ? {}
        : { idempotencyKey: manifestIdempotencyKey })
    })
    const install = await this.storage.putPluginInstall({
      ...(request.installId === undefined ? {} : { id: request.installId }),
      pluginId: manifest.pluginId,
      version: manifest.version,
      layout: expectJsonValue(plan.layout, "plugin install layout"),
      trust: expectJsonValue(trust, "plugin install trust"),
      installRootDir: plan.install.rootDir,
      ...(plan.metadata === undefined ? {} : { metadata: plan.metadata }),
      idempotencyKey:
        request.installIdempotencyKey ??
        `plugin-install:${manifest.pluginId}:${manifest.version}`
    })
    return { manifest, install, trust }
  }

  async submitAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission> {
    return await this.storage.submitPluginAction({
      pluginId: request.pluginId,
      actionId: request.actionId,
      principalId: request.principalId,
      payload: request.payload,
      ...(request.version === undefined ? {} : { version: request.version }),
      ...(request.requiredCapability === undefined
        ? {}
        : { requiredCapability: request.requiredCapability }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: request.jobIdempotencyKey }),
      ...(request.scheduledAt === undefined
        ? {}
        : { scheduledAt: request.scheduledAt }),
      ...(request.notBefore === undefined
        ? {}
        : { notBefore: request.notBefore }),
      ...(request.priority === undefined ? {} : { priority: request.priority }),
      ...(request.maxAttempts === undefined
        ? {}
        : { maxAttempts: request.maxAttempts }),
      ...(request.retryPolicy === undefined
        ? {}
        : { retryPolicy: request.retryPolicy }),
      ...(request.budgetGrantId === undefined
        ? {}
        : { budgetGrantId: request.budgetGrantId })
    })
  }
}
