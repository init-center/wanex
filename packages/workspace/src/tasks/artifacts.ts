import type { ResourceRecord } from "@wanex/protocol"
import {
  type ProviderArtifactOutput,
  WanexResourceRuntime
} from "@wanex/runtime/resources"

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
