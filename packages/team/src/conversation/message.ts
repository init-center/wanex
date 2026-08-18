import type {
  AdmitTeamMessageRequest,
  FailTeamDeliveryMaterializationReceipt,
  FailTeamDeliveryMaterializationRequest,
  ListTeamDeliveriesRequest,
  ListTeamMessagesRequest,
  ListTeamRoutingDecisionsRequest,
  MaterializeTeamDeliveryReceipt,
  MaterializeTeamDeliveryRequest,
  ProjectTeamDeliveryOutcomeReceipt,
  ProjectTeamDeliveryOutcomeRequest,
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest,
  TeamDeliveryRecord,
  TeamDeliveryMaterializationContext,
  TeamMessageRecord,
  TeamRoutingDecisionRecord
} from "@wanex/protocol"
import type { TeamConversationStorage } from "./storage.js"

export async function admitMessage(
  storage: TeamConversationStorage,
  request: AdmitTeamMessageRequest
): Promise<TeamMessageRecord> {
  return await storage.admitTeamMessage(request)
}

export async function getMessage(
  storage: TeamConversationStorage,
  messageId: string
): Promise<TeamMessageRecord | null> {
  return await storage.getTeamMessage(messageId)
}

export async function listMessages(
  storage: TeamConversationStorage,
  request: ListTeamMessagesRequest
): Promise<TeamMessageRecord[]> {
  return await storage.listTeamMessages(request)
}

export async function routeMessage(
  storage: TeamConversationStorage,
  request: RouteTeamMessageRequest
): Promise<RouteTeamMessageReceipt> {
  return await storage.routeTeamMessage(request)
}

export async function getRoutingDecisionByMessage(
  storage: TeamConversationStorage,
  messageId: string
): Promise<TeamRoutingDecisionRecord | null> {
  return await storage.getTeamRoutingDecisionByMessage(messageId)
}

export async function listRoutingDecisions(
  storage: TeamConversationStorage,
  request: ListTeamRoutingDecisionsRequest
): Promise<TeamRoutingDecisionRecord[]> {
  return await storage.listTeamRoutingDecisions(request)
}

export async function listDeliveries(
  storage: TeamConversationStorage,
  request: ListTeamDeliveriesRequest
): Promise<TeamDeliveryRecord[]> {
  return await storage.listTeamDeliveries(request)
}

export async function getDeliveryMaterializationContext(
  storage: TeamConversationStorage,
  deliveryId: string
): Promise<TeamDeliveryMaterializationContext | null> {
  return await storage.getTeamDeliveryMaterializationContext(deliveryId)
}

export async function materializeDelivery(
  storage: TeamConversationStorage,
  request: MaterializeTeamDeliveryRequest
): Promise<MaterializeTeamDeliveryReceipt> {
  return await storage.materializeTeamDelivery(request)
}

export async function failDeliveryMaterialization(
  storage: TeamConversationStorage,
  request: FailTeamDeliveryMaterializationRequest
): Promise<FailTeamDeliveryMaterializationReceipt> {
  return await storage.failTeamDeliveryMaterialization(request)
}

export async function projectDeliveryOutcome(
  storage: TeamConversationStorage,
  request: ProjectTeamDeliveryOutcomeRequest
): Promise<ProjectTeamDeliveryOutcomeReceipt> {
  return await storage.projectTeamDeliveryOutcome(request)
}
