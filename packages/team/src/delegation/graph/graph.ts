import type {
  DelegationGraphRecord,
  DelegationGraphState,
  PrincipalId
} from "@wanex/protocol"
import type { DelegationGraphStorage } from "./storage.js"
import type {
  CreateDelegationGraphRequest,
  ListDelegationGraphsRuntimeRequest
} from "./types.js"

export async function createGraph(input: {
  readonly storage: DelegationGraphStorage
  readonly request: CreateDelegationGraphRequest
  readonly defaultPrincipalId: PrincipalId
}): Promise<DelegationGraphRecord> {
  return await input.storage.putDelegationGraph({
    ...(input.request.id === undefined ? {} : { id: input.request.id }),
    principalId: input.request.principalId ?? input.defaultPrincipalId,
    ...(input.request.title === undefined ? {} : { title: input.request.title }),
    ...(input.request.metadata === undefined
      ? {}
      : { metadata: input.request.metadata }),
    ...(input.request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.request.idempotencyKey })
  })
}

export async function getGraph(
  storage: DelegationGraphStorage,
  graphId: string
): Promise<DelegationGraphRecord | null> {
  return await storage.getDelegationGraph({ graphId })
}

export async function listGraphs(
  storage: DelegationGraphStorage,
  request: ListDelegationGraphsRuntimeRequest = {}
): Promise<DelegationGraphRecord[]> {
  return await storage.listDelegationGraphs({
    ...(request.principalId === undefined
      ? {}
      : { principalId: request.principalId }),
    ...(request.state === undefined ? {} : { state: request.state }),
    ...(request.limit === undefined ? {} : { limit: request.limit })
  })
}

export async function updateGraphState(
  storage: DelegationGraphStorage,
  graphId: string,
  state: DelegationGraphState
): Promise<DelegationGraphRecord> {
  return await storage.updateDelegationGraphState({ graphId, state })
}
