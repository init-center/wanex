import type { PluginActionSubmission, PluginCapability, PluginInstallRecord, PluginInstallState, PluginManifestRecord, PluginManifestState } from "@wanex/protocol"
import type { PluginRuntimeStore } from "./storage.js"
import { createTrustedSubprocessPluginActionHostFromInstall } from "./actions.js"
import { expectJsonValue } from "./internal-validation.js"
import {
  pluginInstallPlanFromJson,
  pluginPackageTrustRecordFromInstallPlan,
  registerPluginManifestRequestFromPackageLayout
} from "./codec.js"
import type { ActivatePluginInstallPlanRequest, ActivatePluginInstallPlanResult, PluginActionHost, RegisterPluginManifestRequest, SubmitPluginActionRequest, PluginRuntimeOptions } from "./types.js"

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

  async listInstalls(
    request: {
      readonly pluginId?: string
      readonly state?: PluginInstallState
      readonly limit?: number
    } = {}
  ): Promise<PluginInstallRecord[]> {
    return await this.storage.listPluginInstalls({
      ...(request.pluginId === undefined ? {} : { pluginId: request.pluginId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
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
    version: string
  ): Promise<PluginManifestRecord> {
    return await this.storage.updatePluginManifestState({
      pluginId,
      state,
      version
    })
  }

  async updateInstallState(request: {
    readonly pluginId: string
    readonly version: string
    readonly expectedState: PluginInstallState
    readonly state: PluginInstallState
  }): Promise<PluginInstallRecord> {
    return await this.storage.updatePluginInstallState({
      pluginId: request.pluginId,
      version: request.version,
      expectedState: request.expectedState,
      state: request.state
    })
  }

  async createTrustedSubprocessActionHost(
    pluginId: string,
    version: string,
    executionEnvironment: import("./types-action.js").SubprocessPluginActionHostOptions["executionEnvironment"]
  ): Promise<PluginActionHost> {
    const manifest = await this.getManifest(pluginId, version)
    if (manifest === null) {
      throw new Error(`plugin manifest not found: ${pluginId}`)
    }
    const install = await this.storage.getPluginInstall({
      pluginId,
      version
    })
    if (install === null) {
      throw new Error(`plugin install not found: ${pluginId}`)
    }
    return createTrustedSubprocessPluginActionHostFromInstall({
      manifest,
      install,
      executionEnvironment
    })
  }

  async activateInstallPlan(
    request: ActivatePluginInstallPlanRequest
  ): Promise<ActivatePluginInstallPlanResult> {
    const plan = pluginInstallPlanFromJson(
      expectJsonValue(request.plan, "plugin install plan")
    )
    const manifestRequest = registerPluginManifestRequestFromPackageLayout(plan.layout)
    const trust = pluginPackageTrustRecordFromInstallPlan(plan)
    const manifestIdempotencyKey =
      request.manifestIdempotencyKey ?? manifestRequest.idempotencyKey
    const manifest = {
      ...manifestRequest,
      ...(request.manifestId === undefined ? {} : { id: request.manifestId }),
      ...(manifestIdempotencyKey === undefined
        ? {}
        : { idempotencyKey: manifestIdempotencyKey })
    }
    const activation = await this.storage.activatePluginInstall({
      manifest,
      install: {
        ...(request.installId === undefined ? {} : { id: request.installId }),
        pluginId: plan.layout.pluginId,
        version: plan.layout.version,
        layout: expectJsonValue(plan.layout, "plugin install layout"),
        trust: expectJsonValue(trust, "plugin install trust"),
        installRootDir: plan.install.rootDir,
        ...(plan.metadata === undefined ? {} : { metadata: plan.metadata }),
        idempotencyKey:
          request.installIdempotencyKey ??
          `plugin-install:${plan.layout.pluginId}:${plan.layout.version}`
      }
    })
    return { ...activation, trust }
  }

  async submitAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission> {
    return await this.storage.submitPluginAction({
      pluginId: request.pluginId,
      version: request.version,
      actionId: request.actionId,
      principalId: request.principalId,
      payload: request.payload,
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
