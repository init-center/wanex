import type {
  GetPluginInstallRequest,
  GetPluginManifestRequest,
  ListPluginInstallsRequest,
  ListPluginManifestsRequest,
  PluginActionSubmission,
  PluginInstallRecord,
  PluginManifestRecord,
  PutPluginInstallRequest,
  PutPluginManifestRequest,
  SubmitPluginActionRequest,
  UpdatePluginInstallStateRequest,
  UpdatePluginManifestStateRequest
} from "@wanex/protocol"

export interface PluginStore {
  putPluginManifest(
    request: PutPluginManifestRequest
  ): Promise<PluginManifestRecord>
  getPluginManifest(
    request: GetPluginManifestRequest
  ): Promise<PluginManifestRecord | null>
  listPluginManifests(
    request: ListPluginManifestsRequest
  ): Promise<PluginManifestRecord[]>
  putPluginInstall(
    request: PutPluginInstallRequest
  ): Promise<PluginInstallRecord>
  getPluginInstall(
    request: GetPluginInstallRequest
  ): Promise<PluginInstallRecord | null>
  listPluginInstalls(
    request: ListPluginInstallsRequest
  ): Promise<PluginInstallRecord[]>
  updatePluginInstallState(
    request: UpdatePluginInstallStateRequest
  ): Promise<PluginInstallRecord>
  updatePluginManifestState(
    request: UpdatePluginManifestStateRequest
  ): Promise<PluginManifestRecord>
  submitPluginAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission>
}
