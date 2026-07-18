import type { JsonValue, PluginManifestRecord } from "@wanex/protocol"
import {
  expectBoolean,
  expectJsonValue,
  expectRecord,
  expectSha256,
  expectString,
  PLUGIN_PACKAGE_SOURCE_KINDS,
  PLUGIN_PACKAGE_TRUST_DECISIONS
} from "./internal-validation.js"
import { WANEX_PLUGIN_PACKAGE_TRUST_KIND } from "./types.js"
import type {
  PluginPackageSourceKind,
  PluginPackageTrustDecision,
  PluginPackageTrustDecisionStatus,
  PluginPackageTrustInstall,
  PluginPackageTrustIntegrity,
  PluginPackageTrustRecord,
  PluginPackageTrustSignature,
  PluginPackageTrustSource
} from "./types.js"

export function pluginPackageTrustRecordFromJson(
  value: JsonValue
): PluginPackageTrustRecord {
  const record = expectRecord(value, "plugin package trust record")
  const kind = expectString(record.kind, "plugin package trust kind")
  if (kind !== WANEX_PLUGIN_PACKAGE_TRUST_KIND) {
    throw new Error("plugin package trust kind is not supported")
  }
  return {
    kind: WANEX_PLUGIN_PACKAGE_TRUST_KIND,
    pluginId: expectString(record.pluginId, "plugin package trust pluginId"),
    version: expectString(record.version, "plugin package trust version"),
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
      : { metadata: expectJsonValue(record.metadata, "plugin package trust metadata") })
  }
}

export function assertPluginPackageTrusted(
  manifest: PluginManifestRecord,
  trust: PluginPackageTrustRecord
): void {
  if (trust.pluginId !== manifest.pluginId) {
    throw new Error("plugin package trust pluginId does not match manifest")
  }
  if (trust.version !== manifest.version) {
    throw new Error("plugin package trust version does not match manifest")
  }
  if (trust.decision.status !== "allow") {
    throw new Error(
      `plugin package trust decision is not allow: ${trust.decision.status}`
    )
  }
  if (trust.signature !== undefined && !trust.signature.verified) {
    throw new Error("plugin package signature is not verified")
  }
}

export function expectPluginPackageTrustSource(
  value: JsonValue | undefined
): PluginPackageTrustSource {
  const record = expectRecord(value, "plugin package trust source")
  const kind = expectString(record.kind, "plugin package trust source kind")
  if (!PLUGIN_PACKAGE_SOURCE_KINDS.has(kind as PluginPackageSourceKind)) {
    throw new Error(`plugin package trust source kind is not supported: ${kind}`)
  }
  return {
    kind: kind as PluginPackageSourceKind,
    ...(record.uri === undefined
      ? {}
      : { uri: expectString(record.uri, "plugin package trust source uri") }),
    ...(record.publisher === undefined
      ? {}
      : {
          publisher: expectString(
            record.publisher,
            "plugin package trust source publisher"
          )
        }),
    ...(record.revision === undefined
      ? {}
      : {
          revision: expectString(
            record.revision,
            "plugin package trust source revision"
          )
        })
  }
}

export function expectPluginPackageTrustIntegrity(
  value: JsonValue | undefined
): PluginPackageTrustIntegrity {
  const record = expectRecord(value, "plugin package trust integrity")
  return {
    ...(record.sha256 === undefined
      ? {}
      : { sha256: expectSha256(record.sha256, "plugin package trust sha256") })
  }
}

export function expectPluginPackageTrustSignature(
  value: JsonValue | undefined
): PluginPackageTrustSignature {
  const record = expectRecord(value, "plugin package trust signature")
  return {
    kind: expectString(record.kind, "plugin package trust signature kind"),
    ...(record.signer === undefined
      ? {}
      : {
          signer: expectString(
            record.signer,
            "plugin package trust signature signer"
          )
        }),
    verified: expectBoolean(
      record.verified,
      "plugin package trust signature verified"
    )
  }
}

export function expectPluginPackageTrustInstall(
  value: JsonValue | undefined
): PluginPackageTrustInstall {
  const record = expectRecord(value, "plugin package trust install")
  return {
    rootDir: expectString(record.rootDir, "plugin package trust install rootDir")
  }
}

export function expectPluginPackageTrustDecision(
  value: JsonValue | undefined
): PluginPackageTrustDecision {
  const record = expectRecord(value, "plugin package trust decision")
  const status = expectString(record.status, "plugin package trust decision status")
  if (!PLUGIN_PACKAGE_TRUST_DECISIONS.has(status as PluginPackageTrustDecisionStatus)) {
    throw new Error(`plugin package trust decision is not supported: ${status}`)
  }
  return {
    status: status as PluginPackageTrustDecisionStatus,
    ...(record.reason === undefined
      ? {}
      : {
          reason: expectString(
            record.reason,
            "plugin package trust decision reason"
          )
        })
  }
}

export function isPluginPackageTrustRecord(
  value: PluginPackageTrustRecord | JsonValue
): value is PluginPackageTrustRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === WANEX_PLUGIN_PACKAGE_TRUST_KIND
  )
}
