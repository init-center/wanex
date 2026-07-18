import type {
  DelegationGraphNodeRecord,
  DelegationNodeState,
  JsonValue,
  PrincipalId
} from "@wanex/protocol"
import type { DelegationGraphStorage } from "./storage.js"
import type {
  AddDelegationGraphNodeRequest,
  UpdateDelegationGraphNodeStateRequest
} from "./types.js"

export async function addNode(input: {
  readonly storage: DelegationGraphStorage
  readonly request: AddDelegationGraphNodeRequest
  readonly defaultPrincipalId: PrincipalId
}): Promise<DelegationGraphNodeRecord> {
  return await input.storage.putDelegationGraphNode({
    ...(input.request.id === undefined ? {} : { id: input.request.id }),
    graphId: input.request.graphId,
    kind: input.request.kind,
    principalId: input.request.principalId ?? input.defaultPrincipalId,
    payload: input.request.payload,
    ...(input.request.metadata === undefined
      ? {}
      : { metadata: input.request.metadata }),
    ...(input.request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.request.idempotencyKey })
  })
}

export async function listNodes(
  storage: DelegationGraphStorage,
  graphId: string,
  state?: DelegationNodeState
): Promise<DelegationGraphNodeRecord[]> {
  return await storage.listDelegationGraphNodes({
    graphId,
    ...(state === undefined ? {} : { state })
  })
}

export async function listReadyNodes(
  storage: DelegationGraphStorage,
  graphId: string,
  limit?: number
): Promise<DelegationGraphNodeRecord[]> {
  return await storage.listReadyDelegationGraphNodes({
    graphId,
    ...(limit === undefined ? {} : { limit })
  })
}

export async function attachNodeJob(
  storage: DelegationGraphStorage,
  nodeId: string,
  schedulerJobId: string
): Promise<DelegationGraphNodeRecord> {
  return await storage.attachDelegationGraphNodeJob({
    nodeId,
    schedulerJobId
  })
}

export async function updateNodeState(
  storage: DelegationGraphStorage,
  request: UpdateDelegationGraphNodeStateRequest
): Promise<DelegationGraphNodeRecord> {
  return await storage.updateDelegationGraphNodeState({
    nodeId: request.nodeId,
    state: request.state,
    ...(request.schedulerJobId === undefined
      ? {}
      : { schedulerJobId: request.schedulerJobId }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  })
}

export async function markNodeState(input: {
  readonly storage: DelegationGraphStorage
  readonly nodeId: string
  readonly state: DelegationNodeState
  readonly schedulerJobId?: string
  readonly metadata?: JsonValue
}): Promise<DelegationGraphNodeRecord> {
  return await updateNodeState(input.storage, {
    nodeId: input.nodeId,
    state: input.state,
    ...(input.schedulerJobId === undefined
      ? {}
      : { schedulerJobId: input.schedulerJobId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
  })
}
