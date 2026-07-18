import { expectJsonValue } from "./internal-validation.js"
import {
  expectPluginPackageTrustSource,
  isPluginInstallPlan,
  pluginInstallPlanFromJson,
} from "./codec.js"
import type {
  PluginInstallPlan,
  PluginInstallerAdapterRequest,
  RunPluginInstallerAdapterRequest,
  RunPluginInstallerAdapterResult
} from "./types.js"

export async function runPluginInstallerAdapter(
  request: RunPluginInstallerAdapterRequest
): Promise<RunPluginInstallerAdapterResult> {
  validatePluginInstallerAdapterRequest(request.request)
  const adapterResult = await request.adapter.install(request.request)
  const plan = isPluginInstallPlan(adapterResult.plan)
    ? adapterResult.plan
    : pluginInstallPlanFromJson(adapterResult.plan)
  validateInstallerPlanMatchesRequest(plan, request.request)
  const registered = await request.runtime.registerInstallPlan({
    plan,
    ...(request.manifestId === undefined ? {} : { manifestId: request.manifestId }),
    ...(request.manifestIdempotencyKey === undefined
      ? {}
      : { manifestIdempotencyKey: request.manifestIdempotencyKey }),
    ...(request.installId === undefined ? {} : { installId: request.installId }),
    ...(request.installIdempotencyKey === undefined
      ? {}
      : { installIdempotencyKey: request.installIdempotencyKey })
  })
  if (adapterResult.metadata !== undefined) {
    expectJsonValue(adapterResult.metadata, "plugin installer adapter metadata")
  }
  return {
    ...registered,
    ...(adapterResult.metadata === undefined
      ? {}
      : { installerMetadata: adapterResult.metadata })
  }
}

export function validatePluginInstallerAdapterRequest(
  request: PluginInstallerAdapterRequest
): void {
  expectPluginPackageTrustSource(
    expectJsonValue(request.source, "plugin installer source")
  )
  if (request.expectedPluginId !== undefined && request.expectedPluginId.length === 0) {
    throw new Error("plugin installer expectedPluginId must not be empty")
  }
  if (request.expectedVersion !== undefined && request.expectedVersion.length === 0) {
    throw new Error("plugin installer expectedVersion must not be empty")
  }
  if (request.installRootDir !== undefined && request.installRootDir.length === 0) {
    throw new Error("plugin installer installRootDir must not be empty")
  }
  if (request.metadata !== undefined) {
    expectJsonValue(request.metadata, "plugin installer request metadata")
  }
}

export function validateInstallerPlanMatchesRequest(
  plan: PluginInstallPlan,
  request: PluginInstallerAdapterRequest
): void {
  if (
    request.expectedPluginId !== undefined &&
    plan.layout.pluginId !== request.expectedPluginId
  ) {
    throw new Error(
      `plugin installer plan pluginId mismatch: ${plan.layout.pluginId} != ${request.expectedPluginId}`
    )
  }
  if (
    request.expectedVersion !== undefined &&
    plan.layout.version !== request.expectedVersion
  ) {
    throw new Error(
      `plugin installer plan version mismatch: ${plan.layout.version} != ${request.expectedVersion}`
    )
  }
  if (
    request.installRootDir !== undefined &&
    plan.install.rootDir !== request.installRootDir
  ) {
    throw new Error(
      `plugin installer plan installRootDir mismatch: ${plan.install.rootDir} != ${request.installRootDir}`
    )
  }
}
