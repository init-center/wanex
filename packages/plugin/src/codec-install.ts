import { isAbsolute, relative, resolve } from "node:path"
import type {
  JsonValue,
  PluginInstallRecord,
  PluginManifestRecord
} from "@wanex/protocol"
import {
  expectJsonValue,
  expectRecord,
  expectString
} from "./internal-validation.js"
import { pluginPackageLayoutFromJson } from "./codec-layout.js"
import {
  assertPluginPackageTrusted,
  expectPluginPackageTrustDecision,
  expectPluginPackageTrustInstall,
  expectPluginPackageTrustIntegrity,
  expectPluginPackageTrustSignature,
  expectPluginPackageTrustSource
} from "./codec-trust.js"
import {
  WANEX_PLUGIN_INSTALL_PLAN_KIND,
  WANEX_PLUGIN_PACKAGE_TRUST_KIND
} from "./types.js"
import type {
  PluginInstallPlan,
  PluginPackageTrustRecord
} from "./types.js"

export function pluginInstallPlanFromJson(value: JsonValue): PluginInstallPlan {
  const record = expectRecord(value, "plugin install plan")
  const kind = expectString(record.kind, "plugin install plan kind")
  if (kind !== WANEX_PLUGIN_INSTALL_PLAN_KIND) {
    throw new Error("plugin install plan kind is not supported")
  }
  return {
    kind: WANEX_PLUGIN_INSTALL_PLAN_KIND,
    layout: pluginPackageLayoutFromJson(
      expectJsonValue(record.layout, "plugin install plan layout")
    ),
    source: expectPluginPackageTrustSource(record.source),
    ...(record.integrity === undefined
      ? {}
      : { integrity: expectPluginPackageTrustIntegrity(record.integrity) }),
    ...(record.signature === undefined
      ? {}
      : { signature: expectPluginPackageTrustSignature(record.signature) }),
    install: expectPluginPackageTrustInstall(record.install),
    decision: expectPluginPackageTrustDecision(record.decision),
    ...(record.metadata === undefined
      ? {}
      : { metadata: expectJsonValue(record.metadata, "plugin install plan metadata") })
  }
}

export function pluginPackageTrustRecordFromInstallPlan(
  plan: PluginInstallPlan | JsonValue
): PluginPackageTrustRecord {
  const parsed = isPluginInstallPlan(plan) ? plan : pluginInstallPlanFromJson(plan)
  return {
    kind: WANEX_PLUGIN_PACKAGE_TRUST_KIND,
    pluginId: parsed.layout.pluginId,
    version: parsed.layout.version,
    source: parsed.source,
    ...(parsed.integrity === undefined ? {} : { integrity: parsed.integrity }),
    ...(parsed.signature === undefined ? {} : { signature: parsed.signature }),
    install: parsed.install,
    decision: parsed.decision,
    ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata })
  }
}

export function assertPluginInstallExecutable(
  manifest: PluginManifestRecord,
  install: PluginInstallRecord,
  trust: PluginPackageTrustRecord
): void {
  if (install.pluginId !== manifest.pluginId) {
    throw new Error("plugin install pluginId does not match manifest")
  }
  if (install.version !== manifest.version) {
    throw new Error("plugin install version does not match manifest")
  }
  if (install.state !== "installed") {
    throw new Error(`plugin install is not installed: ${install.state}`)
  }
  assertPluginPackageTrusted(manifest, trust)
}

export function resolveTrustedPluginCommand(
  installRootDir: string,
  command: string
): string {
  if (installRootDir.length === 0) {
    throw new Error("plugin package install rootDir must not be empty")
  }
  if (command.length === 0) {
    throw new Error("plugin subprocess entry command must not be empty")
  }
  if (isAbsolute(command)) {
    throw new Error("trusted plugin subprocess command must be relative")
  }
  const root = resolve(installRootDir)
  const resolved = resolve(root, command)
  const rel = relative(root, resolved)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("trusted plugin subprocess command escapes install root")
  }
  return resolved
}

export function isPluginInstallPlan(
  value: PluginInstallPlan | JsonValue
): value is PluginInstallPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === WANEX_PLUGIN_INSTALL_PLAN_KIND
  )
}

export function validateInstallerPlanMatchesRequestPlan(
  plan: PluginInstallPlan,
  request: {
    readonly expectedPluginId?: string
    readonly expectedVersion?: string
    readonly installRootDir?: string
  }
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
