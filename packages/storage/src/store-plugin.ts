import {
  type ActivatePluginInstallRequest,
  type GetPluginActionExecutionAdmissionRequest,
  type GetPluginInstallRequest,
  type GetPluginManifestRequest,
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

import {
  fromRpcPluginActionSubmission,
  fromRpcPluginActionExecutionAdmission,
  fromRpcPluginInstallActivation,
  fromRpcPluginInstallRecord,
  fromRpcPluginManifestRecord,
  toRpcGetPluginInstallRequest,
  toRpcGetPluginActionExecutionAdmissionRequest,
  toRpcGetPluginManifestRequest,
  toRpcListPluginInstallsRequest,
  toRpcListPluginManifestsRequest,
  toRpcActivatePluginInstallRequest,
  toRpcPutPluginInstallRequest,
  toRpcPutPluginManifestRequest,
  toRpcSubmitPluginActionRequest,
  toRpcUpdatePluginInstallStateRequest,
  toRpcUpdatePluginManifestStateRequest
} from "./codec-plugin.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { PluginStorageRpcCommand } from "./generated/storage-rpc.js"

export class PluginStoreMethods extends RpcStoreFacetBase {
  async putPluginManifest(
    request: PutPluginManifestRequest
  ): Promise<PluginManifestRecord> {
    const value = await this.callPlugin({
      command: "put-plugin-manifest",
      request: toRpcPutPluginManifestRequest(request)
    })
    return fromRpcPluginManifestRecord(value)
  }

  async getPluginManifest(
    request: GetPluginManifestRequest
  ): Promise<PluginManifestRecord | null> {
    const value = await this.callPlugin({
      command: "get-plugin-manifest",
      request: toRpcGetPluginManifestRequest(request)
    })
    return value === null ? null : fromRpcPluginManifestRecord(value)
  }

  async listPluginManifests(
    request: ListPluginManifestsRequest
  ): Promise<PluginManifestRecord[]> {
    const value = await this.callPlugin({
      command: "list-plugin-manifests",
      request: toRpcListPluginManifestsRequest(request)
    })
    assertArray(value, "plugin manifests")
    return value.map(fromRpcPluginManifestRecord)
  }

  async putPluginInstall(
    request: PutPluginInstallRequest
  ): Promise<PluginInstallRecord> {
    const value = await this.callPlugin({
      command: "put-plugin-install",
      request: toRpcPutPluginInstallRequest(request)
    })
    return fromRpcPluginInstallRecord(value)
  }

  async activatePluginInstall(
    request: ActivatePluginInstallRequest
  ): Promise<PluginInstallActivation> {
    const value = await this.callPlugin({
      command: "activate-plugin-install",
      request: toRpcActivatePluginInstallRequest(request)
    })
    return fromRpcPluginInstallActivation(value)
  }

  async getPluginInstall(
    request: GetPluginInstallRequest
  ): Promise<PluginInstallRecord | null> {
    const value = await this.callPlugin({
      command: "get-plugin-install",
      request: toRpcGetPluginInstallRequest(request)
    })
    return value === null ? null : fromRpcPluginInstallRecord(value)
  }

  async listPluginInstalls(
    request: ListPluginInstallsRequest
  ): Promise<PluginInstallRecord[]> {
    const value = await this.callPlugin({
      command: "list-plugin-installs",
      request: toRpcListPluginInstallsRequest(request)
    })
    assertArray(value, "plugin installs")
    return value.map(fromRpcPluginInstallRecord)
  }

  async updatePluginInstallState(
    request: UpdatePluginInstallStateRequest
  ): Promise<PluginInstallRecord> {
    const value = await this.callPlugin({
      command: "update-plugin-install-state",
      request: toRpcUpdatePluginInstallStateRequest(request)
    })
    return fromRpcPluginInstallRecord(value)
  }

  async updatePluginManifestState(
    request: UpdatePluginManifestStateRequest
  ): Promise<PluginManifestRecord> {
    const value = await this.callPlugin({
      command: "update-plugin-manifest-state",
      request: toRpcUpdatePluginManifestStateRequest(request)
    })
    return fromRpcPluginManifestRecord(value)
  }

  async submitPluginAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission> {
    const value = await this.callPlugin({
      command: "submit-plugin-action",
      request: toRpcSubmitPluginActionRequest(request)
    })
    return fromRpcPluginActionSubmission(value)
  }

  async getPluginActionExecutionAdmission(
    request: GetPluginActionExecutionAdmissionRequest
  ): Promise<PluginActionExecutionAdmission> {
    const value = await this.callPlugin({
      command: "get-plugin-action-execution-admission",
      request: toRpcGetPluginActionExecutionAdmissionRequest(request)
    })
    return fromRpcPluginActionExecutionAdmission(value)
  }

  private callPlugin(request: PluginStorageRpcCommand) {
    return this.call(request)
  }
}
