import type {
  ActivatePluginInstallRequest,
  GetPluginActionExecutionAdmissionRequest,
  GetPluginInstallRequest,
  GetPluginManifestRequest,
  ListPluginInstallsRequest,
  ListPluginManifestsRequest,
  PluginActionSubmission,
  PluginActionExecutionAdmission,
  PluginInstallActivation,
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
  activatePluginInstall(
    request: ActivatePluginInstallRequest
  ): Promise<PluginInstallActivation>
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
  getPluginActionExecutionAdmission(
    request: GetPluginActionExecutionAdmissionRequest
  ): Promise<PluginActionExecutionAdmission>
  submitPluginAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission>
}
