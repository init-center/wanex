import type { PrincipalId, ResourceRecord, WorkspaceChangeSetRecord } from "@wanex/protocol"
import {
  type ProviderArtifactOutput,
  WanexResourceRuntime
} from "@wanex/runtime/resources"
import type { WorkspaceTaskStore } from "./storage.js"
import type { WorkspaceTaskHandlerResult } from "./types.js"

export async function ingestWorkspaceTaskArtifacts(
  resourceRuntime: WanexResourceRuntime,
  artifacts: readonly ProviderArtifactOutput[]
): Promise<ResourceRecord[]> {
  const resources: ResourceRecord[] = []
  for (const artifact of artifacts) {
    resources.push(await resourceRuntime.ingestProviderOutput(artifact))
  }
  return resources
}

export async function persistWorkspaceTaskChangeSet(
  storage: WorkspaceTaskStore,
  request: {
    readonly workspaceId: string
    readonly principalId: PrincipalId
    readonly result: WorkspaceTaskHandlerResult
  }
): Promise<WorkspaceChangeSetRecord | undefined> {
  if (request.result.changeSet === undefined) {
    return undefined
  }
  return await storage.putWorkspaceChangeSet({
    workspaceId: request.workspaceId,
    principalId: request.principalId,
    changeSet: request.result.changeSet
  })
}
