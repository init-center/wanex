import { createHash } from "node:crypto";
import type { BackendShell } from "@wanex/product/backend";
import {
  conversationApprovalId,
  conversationOperationId,
  projectConversationOperation,
  readTrackedConversationOperation,
} from "./operation.js";
import {
  resolveSessionId,
  type StateCoordinator,
} from "../state/product.js";
import type {
  ConversationOperationReadModel,
  ConversationOperationRejectedResult,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationApprovalResult,
} from "./model.js";

const MAX_APPROVAL_REASON_BYTES = 1_024;

export async function resolveTrackedConversationApproval(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: ResolveTrackedConversationApprovalRequest;
}): Promise<ResolveTrackedConversationApprovalResult> {
  const sessionId = resolveSessionId(
    request.state.state,
    request.input.sessionId,
  );
  if (sessionId === undefined) {
    return rejected("no_session", "select a session before reviewing approval");
  }
  const reference = request.state.state.trackedConversationOperations[sessionId];
  if (reference === undefined) {
    return rejected(
      "approval_not_found",
      "no tracked approval exists for this session",
      sessionId,
    );
  }
  const source = await request.backend.commands.readConversationOperation(reference);
  if (source.kind === "missing") {
    return rejected(
      "operation_not_found",
      "the tracked conversation operation no longer exists",
      sessionId,
    );
  }
  const projected = projectConversationOperation(source);
  const trustedApproval = source.operation.approvals?.items.find(
    (item) =>
      conversationApprovalId(reference, item.executionId) ===
      request.input.approvalId,
  );
  if (trustedApproval === undefined) {
    return rejected(
      "approval_not_found",
      "the requested approval is not current",
      sessionId,
      projected.operation,
    );
  }
  if (
    !Number.isSafeInteger(request.input.expectedApprovalRevision) ||
    request.input.expectedApprovalRevision < 0 ||
    trustedApproval.approvalRevision !== request.input.expectedApprovalRevision
  ) {
    return rejected(
      "approval_revision_stale",
      "the approval review changed; refresh before deciding",
      sessionId,
      projected.operation,
    );
  }
  if (!trustedApproval.availableDecisions.includes(request.input.decision)) {
    return rejected(
      "approval_action_unavailable",
      "the requested approval decision is not available",
      sessionId,
      projected.operation,
    );
  }
  const reason = request.input.reason.trim();
  if (reason.length === 0) {
    return rejected(
      "invalid_approval_payload",
      "approval reason must not be empty",
      sessionId,
      projected.operation,
    );
  }
  if (Buffer.byteLength(reason, "utf8") > MAX_APPROVAL_REASON_BYTES) {
    return rejected(
      "invalid_approval_payload",
      "approval reason exceeds 1024 bytes",
      sessionId,
      projected.operation,
    );
  }
  const receipt =
    await request.backend.commands.resolveConversationOperationApproval({
      ...reference,
      executionId: trustedApproval.executionId,
      expectedApprovalRevision: request.input.expectedApprovalRevision,
      decision: request.input.decision,
      reason,
      idempotencyKey: productApprovalDecisionIdempotencyKey(
        conversationOperationId(reference),
        request.input,
        reason,
      ),
    });
  return {
    kind: "product.conversation-approval.resolved",
    decision: receipt.decision,
    action: receipt.action,
    operation: await readTrackedConversationOperation({
      backend: request.backend,
      state: request.state,
      input: { sessionId },
    }),
  };
}

function productApprovalDecisionIdempotencyKey(
  operationId: string,
  input: ResolveTrackedConversationApprovalRequest,
  reason: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        approvalId: input.approvalId,
        decision: input.decision,
        expectedApprovalRevision: input.expectedApprovalRevision,
        operationId,
        reason,
      }),
    )
    .digest("hex");
  return `product:approval:${digest}`;
}

function rejected(
  reason: ConversationOperationRejectedResult["reason"],
  message: string,
  sessionId?: string,
  operation?: ConversationOperationReadModel,
): ConversationOperationRejectedResult {
  return {
    kind: "product.conversation-operation.rejected",
    reason,
    message,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operation === undefined ? {} : { operation }),
  };
}
