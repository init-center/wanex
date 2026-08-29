import type { SurfaceCommand } from "../model.js";
import {
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord,
  isSideQuerySafeError,
  optionalBoolean,
  optionalNumber,
  optionalPositiveInteger,
  optionalSideQuerySafeError,
  optionalString,
} from "./common.js";
import {
  isReadTeamConversationResult,
  isTeamConversationListReadModel,
  isTeamConversationSummary,
  isTeamParticipantReadModel,
  isTeamRoundReceipt,
} from "./team.js";
import {
  isCancelLocalPluginReviewResult,
  isPluginManagementMutationResult,
  isPluginManagementReadResult,
  isRequestLocalPluginReviewResult,
} from "./plugin-management.js";
import {
  isScheduleDefinitionReadResult,
  isScheduleListReadModel,
  isScheduleMutationResult
} from "./schedule.js";

export function isSurfaceCommandValue(
  value: unknown,
  command: SurfaceCommand,
): boolean {
  switch (command) {
    case "readPluginManagement":
      return isPluginManagementReadResult(value);
    case "requestLocalPluginReview":
      return isRequestLocalPluginReviewResult(value);
    case "approveLocalPluginReview":
    case "setPluginInstallState":
    case "retryPluginRefresh":
      return isPluginManagementMutationResult(value);
    case "cancelLocalPluginReview":
      return isCancelLocalPluginReviewResult(value);
    case "listSchedules":
      return isScheduleListReadModel(value);
    case "readSchedule":
      return isScheduleDefinitionReadResult(value);
    case "createSchedule":
    case "replaceSchedule":
    case "setScheduleEnabled":
    case "removeSchedule":
      return isScheduleMutationResult(value);
    case "listTeamConversations":
      return isTeamConversationListReadModel(value);
    case "readTeamConversation":
      return isReadTeamConversationResult(value);
    case "selectTeamConversation":
    case "createTeamConversation":
    case "closeTeamConversation":
    case "setTeamCoordinator":
      return isTeamConversationSummary(value);
    case "addTeamParticipant":
    case "updateTeamParticipant":
      return isTeamParticipantReadModel(value);
    case "submitTeamRound":
      return isTeamRoundReceipt(value);
    case "startSideQuery":
    case "cancelSideQuery":
      return isSideQueryReadModel(value);
    case "readSideQuery":
      return isSideQueryReadResult(value);
    case "dismissSideQuery":
      return (
        isRecord(value) &&
        value.kind === "assistant.side-query.dismissed" &&
        typeof value.queryId === "string"
      );
    case "startPlanGeneration":
    case "cancelPlanGeneration":
      return isPlanGenerationReadModel(value);
    case "readPlanGeneration":
      return isPlanGenerationReadResult(value);
    case "dismissPlanGeneration":
      return (
        isRecord(value) &&
        value.kind === "assistant.plan-generation.dismissed" &&
        typeof value.operationId === "string"
      );
    case "readPlanProposal":
    case "revisePlanProposal":
    case "decidePlanProposal":
      return isPlanProposalReadResult(value);
    case "listPlanProposals":
      return (
        isRecord(value) &&
        value.kind === "assistant.plan-proposal-list" &&
        typeof value.sessionId === "string" &&
        Array.isArray(value.proposals) &&
        value.proposals.every(isPlanProposalReadModel)
      );
    case "executePlanProposal":
      return (
        isRecord(value) &&
        value.kind === "assistant.plan-execution.submitted" &&
        isPlanProposalReadModel(value.proposal) &&
        isRecord(value.operation)
      );
    case "readGoal":
      return isGoalReadResult(value);
    case "startGoal":
    case "pauseGoal":
    case "resumeGoal":
    case "cancelGoal":
      return isGoalReadModel(value);
    default:
      return true;
  }
}

function isGoalReadResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "assistant.goal.no-session") {
    return value.message === "select a session before reading its Goal";
  }
  if (value.kind === "assistant.goal.missing") {
    return optionalString(value.goalId) && optionalString(value.sessionId);
  }
  return value.kind === "assistant.goal.found" && isGoalReadModel(value.goal);
}

function isGoalReadModel(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === "assistant.goal" &&
    typeof value.goalId === "string" &&
    typeof value.sessionId === "string" &&
    isPositiveSafeInteger(value.revision) &&
    isGoalState(value.state) &&
    typeof value.objective === "string" &&
    isStringArray(value.boundaries) &&
    isStringArray(value.constraints) &&
    Array.isArray(value.successCriteria) &&
    value.successCriteria.every(isGoalCriterion) &&
    isGoalStopPolicy(value.stopPolicy) &&
    isGoalStateReason(value.reason) &&
    isNonNegativeSafeInteger(value.attemptCount) &&
    optionalString(value.activeAttemptId) &&
    Array.isArray(value.attempts) &&
    value.attempts.every(isGoalAttempt) &&
    value.attempts.length <= value.attemptCount &&
    typeof value.canPause === "boolean" &&
    typeof value.canResume === "boolean" &&
    typeof value.canCancel === "boolean" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number" &&
    optionalNumber(value.closedAt)
  );
}

function isGoalCriterion(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.description === "string"
  );
}

function isGoalStopPolicy(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPositiveSafeInteger(value.maxAttempts) &&
    isPositiveSafeInteger(value.maxConsecutiveBlockedAttempts) &&
    optionalNumber(value.deadlineAt) &&
    (value.budget === undefined || isGoalBudget(value.budget))
  );
}

function isGoalBudget(value: unknown): boolean {
  return (
    isRecord(value) &&
    optionalPositiveInteger(value.tokens) &&
    optionalPositiveInteger(value.costMicros) &&
    optionalPositiveInteger(value.wallTimeMs) &&
    optionalPositiveInteger(value.toolCalls)
  );
}

function isGoalStateReason(value: unknown): boolean {
  if (!isRecord(value) || !optionalString(value.detail)) return false;
  return (
    value.code === "created" ||
    value.code === "user_paused" ||
    value.code === "user_resumed" ||
    value.code === "verification_succeeded" ||
    value.code === "verification_blocked" ||
    value.code === "max_attempts" ||
    value.code === "deadline" ||
    value.code === "budget" ||
    value.code === "verification_failed" ||
    value.code === "cancel_requested" ||
    value.code === "cancelled" ||
    value.code === "unrecoverable_failure"
  );
}

function isGoalAttempt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === "string" &&
    isPositiveSafeInteger(value.attemptNumber) &&
    typeof value.inputId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.jobId === "string" &&
    (value.trigger === "initial" ||
      value.trigger === "automatic_continuation" ||
      value.trigger === "user_resume") &&
    typeof value.boundAt === "number" &&
    (value.review === undefined || isGoalReview(value.review)) &&
    Array.isArray(value.verifications) &&
    value.verifications.every(isGoalVerification)
  );
}

function isGoalReview(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.disposition === "continue" ||
      value.disposition === "blocked" ||
      value.disposition === "succeeded" ||
      value.disposition === "failed") &&
    optionalString(value.reason) &&
    typeof value.createdAt === "number"
  );
}

function isGoalVerification(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.requirementId === "string" &&
    (value.result === "passed" ||
      value.result === "failed" ||
      value.result === "inconclusive" ||
      value.result === "blocked") &&
    optionalString(value.reason) &&
    typeof value.createdAt === "number"
  );
}

function isGoalState(value: unknown): boolean {
  return (
    value === "active" ||
    value === "paused" ||
    value === "blocked" ||
    value === "limit_reached" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancel_requested" ||
    value === "cancelled"
  );
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlanGenerationReadResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "assistant.plan-generation.missing") {
    return typeof value.operationId === "string";
  }
  return (
    value.kind === "assistant.plan-generation.found" &&
    isPlanGenerationReadModel(value.generation)
  );
}

function isPlanGenerationReadModel(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.kind !== "assistant.plan-generation" ||
    typeof value.operationId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.startedAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    !optionalNumber(value.finishedAt) ||
    !optionalString(value.proposalId) ||
    !optionalSideQuerySafeError(value.error)
  ) {
    return false;
  }
  switch (value.state) {
    case "running":
      return value.finishedAt === undefined && value.proposalId === undefined && value.error === undefined;
    case "succeeded":
      return typeof value.finishedAt === "number" && typeof value.proposalId === "string" && value.error === undefined;
    case "failed":
      return typeof value.finishedAt === "number" && isSideQuerySafeError(value.error) && value.proposalId === undefined;
    case "cancelled":
      return typeof value.finishedAt === "number" && value.proposalId === undefined && value.error === undefined;
    default:
      return false;
  }
}

function isPlanProposalReadResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "assistant.plan-proposal.no-selection") return true;
  if (value.kind === "assistant.plan-proposal.missing") {
    return typeof value.proposalId === "string";
  }
  return (
    value.kind === "assistant.plan-proposal.found" &&
    isPlanProposalReadModel(value.proposal)
  );
}

function isPlanProposalReadModel(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === "assistant.plan-proposal" &&
    typeof value.proposalId === "string" &&
    isPositiveSafeInteger(value.revision) &&
    (value.state === "open" ||
      value.state === "approved" ||
      value.state === "rejected" ||
      value.state === "withdrawn") &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.steps) &&
    Array.isArray(value.references) &&
    isRecord(value.source) &&
    typeof value.source.sessionId === "string" &&
    isRecord(value.generation) &&
    typeof value.generation.endpointId === "string" &&
    typeof value.generation.providerId === "string" &&
    typeof value.generation.modelId === "string" &&
    typeof value.generation.generatedAt === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isSideQueryReadResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "assistant.side-query.missing") {
    return typeof value.queryId === "string";
  }
  return (
    value.kind === "assistant.side-query.found" &&
    isSideQueryReadModel(value.query)
  );
}

function isSideQueryReadModel(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.kind !== "assistant.side-query" ||
    typeof value.queryId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.modelEndpointId !== "string" ||
    typeof value.question !== "string" ||
    typeof value.startedAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    !optionalPositiveInteger(value.maxOutputTokens) ||
    !optionalString(value.answerText) ||
    !optionalBoolean(value.answerTruncated) ||
    !optionalSideQuerySafeError(value.error) ||
    !optionalNumber(value.finishedAt)
  ) {
    return false;
  }
  switch (value.state) {
    case "running":
      return value.finishedAt === undefined && value.answerText === undefined && value.error === undefined;
    case "succeeded":
      return typeof value.finishedAt === "number" && typeof value.answerText === "string" && value.error === undefined;
    case "failed":
      return typeof value.finishedAt === "number" && isSideQuerySafeError(value.error) && value.answerText === undefined;
    case "cancelled":
      return typeof value.finishedAt === "number" && value.answerText === undefined && value.error === undefined;
    default:
      return false;
  }
}
