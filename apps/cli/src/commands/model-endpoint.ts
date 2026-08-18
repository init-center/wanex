import type { ModelEndpoint } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  readModelEndpoint,
  summarizeModelEndpoint,
  writeModelEndpoint
} from "@wanex/runtime/provider"

export async function modelEndpointSetValue(
  storage: CoreStore,
  modelEndpoint: ModelEndpoint
): Promise<unknown> {
  await writeModelEndpoint(storage, modelEndpoint)
  return {
    command: "model-endpoint-set",
    modelEndpoint: summarizeModelEndpoint(modelEndpoint)
  }
}

export async function modelEndpointGetValue(
  storage: CoreStore,
  endpointId: string
): Promise<unknown> {
  const modelEndpoint = await readModelEndpoint(storage, endpointId)
  return {
    command: "model-endpoint-get",
    modelEndpoint:
      modelEndpoint === null ? null : summarizeModelEndpoint(modelEndpoint)
  }
}
