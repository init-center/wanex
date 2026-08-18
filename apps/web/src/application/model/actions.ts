import type {
  CancelTrackedConversationOperationRequest,
  OpenWorkbenchRequest,
  QueueGuidedFollowUpRequest,
  SteerTrackedConversationOperationRequest,
  ReadTrackedConversationOperationRequest,
  RegenerateTrackedConversationOperationRequest,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationRecoveryRequest,
  RemoveConversationAttachmentRequest,
  RenameSessionRequest,
  ArchiveSessionRequest,
  RestoreSessionRequest,
  SetLayoutRequest,
  SetModeRequest,
  StartSideQueryRequest,
  SubmitConversationOperationRequest,
  ExecuteCommandRequest,
  PreviewCommandInvocationRequest,
  UpdatePreferencesRequest,
  DecidePlanProposalRequest,
  ExecutePlanProposalRequest,
  RevisePlanProposalRequest,
  StartPlanGenerationRequest,
  CancelGoalRequest,
  ChangeGoalStateRequest,
  StartGoalRequest,
  AddTeamParticipantRequest,
  CloseTeamConversationRequest,
  CreateTeamConversationRequest,
  SetTeamCoordinatorRequest,
  SubmitTeamRoundRequest,
  UpdateTeamParticipantRequest
} from "@wanex/product/surface"
import type {
  ApproveLocalPluginReviewRequest,
  CancelLocalPluginReviewRequest,
  SetPluginInstallStateRequest
} from "@wanex/product/plugin-management"
import type {
  ExecutionReferenceRequest
} from "../execution/model.js"

export type Action =
  | {
      readonly type: "refresh"
    }
  | {
      readonly type: "start-new-conversation"
    }
  | {
      readonly type: "select-session"
      readonly sessionId: string
    }
  | {
      readonly type: "rename-session"
      readonly input: RenameSessionRequest
    }
  | {
      readonly type: "archive-session"
      readonly input: ArchiveSessionRequest
    }
  | {
      readonly type: "restore-session"
      readonly input: RestoreSessionRequest
    }
  | {
      readonly type: "set-layout"
      readonly input: SetLayoutRequest
    }
  | {
      readonly type: "set-mode"
      readonly input: SetModeRequest
    }
  | {
      readonly type: "update-preferences"
      readonly input: UpdatePreferencesRequest
    }
  | {
      readonly type: "set-active-model-endpoint"
      readonly input: {
        readonly endpointId: string
      }
    }
  | {
      readonly type: "preview-command"
      readonly input: PreviewCommandInvocationRequest
    }
  | {
      readonly type: "execute-command"
      readonly input: ExecuteCommandRequest
    }
  | {
      readonly type: "refresh-execution"
      readonly input: ExecutionReferenceRequest
    }
  | {
      readonly type: "open-workbench"
      readonly input?: OpenWorkbenchRequest
    }
  | {
      readonly type: "submit-conversation"
      readonly input: SubmitConversationOperationRequest
    }
  | {
      readonly type: "queue-guided-follow-up"
      readonly input: QueueGuidedFollowUpRequest
    }
  | {
      readonly type: "steer-current-response"
      readonly input: Omit<
        SteerTrackedConversationOperationRequest,
        "requestId"
      >
    }
  | {
      readonly type: "start-side-query"
      readonly input: StartSideQueryRequest
    }
  | {
      readonly type: "cancel-side-query"
      readonly input: {
        readonly queryId: string
      }
    }
  | {
      readonly type: "dismiss-side-query"
      readonly input: {
        readonly queryId: string
      }
    }
  | {
      readonly type: "start-plan-generation"
      readonly input: StartPlanGenerationRequest
    }
  | {
      readonly type: "cancel-plan-generation"
      readonly input: { readonly operationId: string }
    }
  | {
      readonly type: "dismiss-plan-generation"
      readonly input: { readonly operationId: string }
    }
  | {
      readonly type: "revise-plan-proposal"
      readonly input: RevisePlanProposalRequest
    }
  | {
      readonly type: "decide-plan-proposal"
      readonly input: DecidePlanProposalRequest
    }
  | {
      readonly type: "execute-plan-proposal"
      readonly input: ExecutePlanProposalRequest
    }
  | {
      readonly type: "start-goal"
      readonly input: StartGoalRequest
    }
  | {
      readonly type: "pause-goal"
      readonly input: ChangeGoalStateRequest
    }
  | {
      readonly type: "resume-goal"
      readonly input: ChangeGoalStateRequest
    }
  | {
      readonly type: "cancel-goal"
      readonly input: CancelGoalRequest
    }
  | {
      readonly type: "remove-conversation-attachment"
      readonly input: RemoveConversationAttachmentRequest
    }
  | {
      readonly type: "refresh-conversation"
      readonly input?: ReadTrackedConversationOperationRequest
    }
  | {
      readonly type: "load-earlier-history"
      readonly input: {
        readonly sessionId: string
        readonly cursor: string
        readonly limit: number
      }
    }
  | {
      readonly type: "cancel-conversation"
      readonly input: CancelTrackedConversationOperationRequest
    }
  | {
      readonly type: "regenerate-conversation"
      readonly input?: RegenerateTrackedConversationOperationRequest
    }
  | {
      readonly type: "resolve-conversation-approval"
      readonly input: ResolveTrackedConversationApprovalRequest
    }
  | {
      readonly type: "resolve-conversation-recovery"
      readonly input: ResolveTrackedConversationRecoveryRequest
    }
  | {
      readonly type: "create-team-conversation"
      readonly input: CreateTeamConversationRequest
    }
  | {
      readonly type: "select-team-conversation"
      readonly conversationId: string
    }
  | {
      readonly type: "close-team-conversation"
      readonly input: CloseTeamConversationRequest
    }
  | {
      readonly type: "add-team-participant"
      readonly input: AddTeamParticipantRequest
    }
  | {
      readonly type: "update-team-participant"
      readonly input: UpdateTeamParticipantRequest
    }
  | {
      readonly type: "set-team-coordinator"
      readonly input: SetTeamCoordinatorRequest
    }
  | {
      readonly type: "submit-team-round"
      readonly input: SubmitTeamRoundRequest
    }
  | {
      readonly type: "load-earlier-team-history"
      readonly input: {
        readonly conversationId: string
        readonly cursor: string
        readonly limit: number
      }
    }
  | {
      readonly type: "read-plugin-management"
    }
  | {
      readonly type: "request-local-plugin-review"
    }
  | {
      readonly type: "approve-local-plugin-review"
      readonly input: ApproveLocalPluginReviewRequest
    }
  | {
      readonly type: "cancel-local-plugin-review"
      readonly input: CancelLocalPluginReviewRequest
    }
  | {
      readonly type: "set-plugin-install-state"
      readonly input: SetPluginInstallStateRequest
    }
  | {
      readonly type: "retry-plugin-refresh"
    }
