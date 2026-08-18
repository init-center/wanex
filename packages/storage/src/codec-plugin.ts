import {
  type ActivatePluginInstallRequest,
  type GetPluginActionExecutionAdmissionRequest,
  type GetPluginInstallRequest,
  type GetPluginManifestRequest,
  type JsonValue,
  type ListPluginInstallsRequest,
  type ListPluginManifestsRequest,
  type PluginActionSubmission,
  type PluginActionExecutionAdmission,
  type PluginInstallActivation,
  type PluginInstallRecord,
  type PluginManifestRecord,
  type PutPluginInstallRequest,
  type PutPluginManifestRequest,
  type SubmitPluginActionRequest,
  type UpdatePluginInstallStateRequest,
  type UpdatePluginManifestStateRequest
} from "@wanex/protocol"

import { toRpcJsonValue } from "./codec-common.js"
import type {
  ActivatePluginInstallWire,
  GetPluginActionExecutionAdmissionWire,
  GetPluginInstallWire,
  GetPluginManifestWire,
  ListPluginInstallsWire,
  ListPluginManifestsWire,
  PutPluginInstallWire,
  PutPluginManifestWire,
  SubmitPluginActionWire,
  UpdatePluginInstallStateWire,
  UpdatePluginManifestStateWire
} from "./generated/storage-rpc.js"

import {
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectPluginCapabilities,
  expectPluginInstallState,
  expectPluginManifestState
} from "./codec-plugin-enums.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"

export function toRpcPutPluginManifestRequest(
  request: PutPluginManifestRequest
): PutPluginManifestWire {
  return {
    id: request.id ?? null,
    plugin_id: request.pluginId,
    version: request.version,
    name: request.name ?? null,
    entry: toRpcJsonValue(request.entry ?? null),
    capabilities: [...request.capabilities],
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetPluginManifestRequest(
  request: GetPluginManifestRequest
): GetPluginManifestWire {
  return {
    plugin_id: request.pluginId,
    version: request.version ?? null
  }
}

export function toRpcListPluginManifestsRequest(
  request: ListPluginManifestsRequest
): ListPluginManifestsWire {
  return {
    state: request.state ?? null,
    capability: request.capability ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcPutPluginInstallRequest(
  request: PutPluginInstallRequest
): PutPluginInstallWire {
  return {
    id: request.id ?? null,
    plugin_id: request.pluginId,
    version: request.version,
    layout: toRpcJsonValue(request.layout),
    trust: toRpcJsonValue(request.trust),
    install_root_dir: request.installRootDir,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcActivatePluginInstallRequest(
  request: ActivatePluginInstallRequest
): ActivatePluginInstallWire {
  return {
    manifest: toRpcPutPluginManifestRequest(request.manifest),
    install: toRpcPutPluginInstallRequest(request.install)
  }
}

export function toRpcGetPluginInstallRequest(
  request: GetPluginInstallRequest
): GetPluginInstallWire {
  return {
    plugin_id: request.pluginId,
    version: request.version ?? null
  }
}

export function toRpcListPluginInstallsRequest(
  request: ListPluginInstallsRequest
): ListPluginInstallsWire {
  return {
    plugin_id: request.pluginId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcUpdatePluginManifestStateRequest(
  request: UpdatePluginManifestStateRequest
): UpdatePluginManifestStateWire {
  return {
    plugin_id: request.pluginId,
    version: request.version,
    state: request.state
  }
}

export function toRpcUpdatePluginInstallStateRequest(
  request: UpdatePluginInstallStateRequest
): UpdatePluginInstallStateWire {
  return {
    plugin_id: request.pluginId,
    version: request.version,
    expected_state: request.expectedState,
    state: request.state
  }
}

export function toRpcSubmitPluginActionRequest(
  request: SubmitPluginActionRequest
): SubmitPluginActionWire {
  return {
    plugin_id: request.pluginId,
    version: request.version,
    action_id: request.actionId,
    principal_id: request.principalId,
    payload: toRpcJsonValue(request.payload),
    required_capability: request.requiredCapability ?? null,
    job_id: request.jobId ?? null,
    job_idempotency_key: request.jobIdempotencyKey ?? null,
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    max_attempts: request.maxAttempts ?? null,
    retry_policy:
      request.retryPolicy === undefined
        ? null
        : {
            strategy: request.retryPolicy.strategy,
            initial_delay_ms: request.retryPolicy.initialDelayMs ?? null,
            max_delay_ms: request.retryPolicy.maxDelayMs ?? null
          },
    budget_grant_id: request.budgetGrantId ?? null
  }
}

export function toRpcGetPluginActionExecutionAdmissionRequest(
  request: GetPluginActionExecutionAdmissionRequest
): GetPluginActionExecutionAdmissionWire {
  return {
    plugin_id: request.pluginId,
    version: request.version,
    required_capability: request.requiredCapability
  }
}

export function fromRpcPluginManifestRecord(
  value: JsonValue
): PluginManifestRecord {
  if (!isRecord(value)) {
    throw new Error("plugin manifest must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "plugin_manifest.id"),
      pluginId: expectString(value.plugin_id, "plugin_manifest.plugin_id"),
      version: expectString(value.version, "plugin_manifest.version"),
      capabilities: expectPluginCapabilities(value.capabilities),
      state: expectPluginManifestState(value.state),
      createdAt: expectNumber(value.created_at, "plugin_manifest.created_at"),
      updatedAt: expectNumber(value.updated_at, "plugin_manifest.updated_at")
    },
    {
      name: optionalString(value.name, "plugin_manifest.name"),
      entry: value.entry ?? undefined,
      metadata: value.metadata ?? undefined,
      disabledAt: optionalNumber(value.disabled_at, "plugin_manifest.disabled_at")
    }
  )
}

export function fromRpcPluginInstallRecord(value: JsonValue): PluginInstallRecord {
  if (!isRecord(value)) {
    throw new Error("plugin install must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "plugin_install.id"),
      pluginId: expectString(value.plugin_id, "plugin_install.plugin_id"),
      version: expectString(value.version, "plugin_install.version"),
      state: expectPluginInstallState(value.state),
      layout: expectJsonField(value, "layout", "plugin_install.layout"),
      trust: expectJsonField(value, "trust", "plugin_install.trust"),
      installRootDir: expectString(
        value.install_root_dir,
        "plugin_install.install_root_dir"
      ),
      installedAt: expectNumber(value.installed_at, "plugin_install.installed_at"),
      updatedAt: expectNumber(value.updated_at, "plugin_install.updated_at")
    },
    {
      metadata: value.metadata ?? undefined,
      disabledAt: optionalNumber(value.disabled_at, "plugin_install.disabled_at"),
      removedAt: optionalNumber(value.removed_at, "plugin_install.removed_at")
    }
  )
}

export function fromRpcPluginInstallActivation(
  value: JsonValue
): PluginInstallActivation {
  if (!isRecord(value)) {
    throw new Error("plugin install activation must be an object")
  }
  return {
    manifest: fromRpcPluginManifestRecord(
      expectJsonField(value, "manifest", "plugin_install_activation.manifest")
    ),
    install: fromRpcPluginInstallRecord(
      expectJsonField(value, "install", "plugin_install_activation.install")
    )
  }
}

export function fromRpcPluginActionSubmission(
  value: JsonValue
): PluginActionSubmission {
  if (!isRecord(value)) {
    throw new Error("plugin action submission must be an object")
  }
  return {
    manifest: fromRpcPluginManifestRecord(
      expectJsonField(value, "manifest", "plugin_action.manifest")
    ),
    job: fromRpcSchedulerJobRecord(
      expectJsonField(value, "job", "plugin_action.job")
    )
  }
}

export function fromRpcPluginActionExecutionAdmission(
  value: JsonValue
): PluginActionExecutionAdmission {
  if (!isRecord(value)) {
    throw new Error("plugin action execution admission must be an object")
  }
  return {
    manifest: fromRpcPluginManifestRecord(
      expectJsonField(
        value,
        "manifest",
        "plugin_action_execution_admission.manifest"
      )
    ),
    install: fromRpcPluginInstallRecord(
      expectJsonField(
        value,
        "install",
        "plugin_action_execution_admission.install"
      )
    )
  }
}
