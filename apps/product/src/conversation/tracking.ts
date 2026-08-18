import type { UserMessageInputPart } from "@wanex/protocol";
import type {
  BackendConversationOperationReadResult,
  BackendConversationOperationReceipt,
  BackendShell,
} from "@wanex/product/backend";
import { projectProviderReadiness } from "../provider/readiness.js";
import {
  promotePendingGuidedFollowUp,
  withoutPendingGuidedFollowUp,
  type MutableState,
} from "../state/product.js";
import type {
  ConversationOperationFoundResult,
  ConversationOperationReadModel,
  ConversationOperationRejectedResult,
  PendingGuidedFollowUpReadModel,
  ReadTrackedConversationOperationResult,
  TrustedConversationOperationReference,
} from "./model.js";
import {
  conversationOperationId,
  projectConversationOperation,
} from "./projection.js";

const terminalStates = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);
const cancellableStates = new Set(["queued", "running", "waiting"]);

export function sourceConversationContent(
  source: Extract<
    BackendConversationOperationReadResult,
    { readonly kind: "found" }
  >,
  inputId: string,
): UserMessageInputPart[] | undefined {
  const sourceRow = source.operation.transcript.rows.find(
    (row) => row.role === "user" && row.inputId === inputId,
  );
  return sourceRow?.parts.reduce<UserMessageInputPart[]>((parts, part) => {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "resource") {
      parts.push({ type: "resource", resourceId: part.resourceId });
    }
    return parts;
  }, []);
}

export async function readTrackedOperation(
  backend: BackendShell,
  state: MutableState,
  sessionId: string,
): Promise<ReadTrackedConversationOperationResult> {
  const reference = state.trackedConversationOperations[sessionId];
  if (reference === undefined) return untracked(sessionId);
  const source = await backend.commands.readConversationOperation(reference);
  if (source.kind === "missing") {
    return {
      kind: "product.conversation-operation.missing",
      sessionId,
      operationId: conversationOperationId(reference),
      message: "the tracked conversation operation no longer exists",
    };
  }
  const projected = projectConversationOperation(source);
  const pendingReference = state.pendingGuidedFollowUps[sessionId];
  if (pendingReference === undefined) return projected;
  const pending = await readPendingGuidedFollowUp(backend, pendingReference);
  return pending === undefined
    ? projected
    : { ...projected, pendingFollowUp: pending.readModel };
}

export async function readTrackedOperationWithPromotion(
  backend: BackendShell,
  state: MutableState,
  sessionId: string,
): Promise<{
  readonly value: ReadTrackedConversationOperationResult;
  readonly next?: MutableState;
}> {
  const reference = state.trackedConversationOperations[sessionId];
  if (reference === undefined) return { value: untracked(sessionId) };
  const source = await backend.commands.readConversationOperation(reference);
  if (source.kind === "missing") {
    return {
      value: {
        kind: "product.conversation-operation.missing",
        sessionId,
        operationId: conversationOperationId(reference),
        message: "the tracked conversation operation no longer exists",
      },
    };
  }
  const current = projectConversationOperation(source);
  const pendingReference = state.pendingGuidedFollowUps[sessionId];
  if (pendingReference === undefined) return { value: current };
  const pending = await readPendingGuidedFollowUp(backend, pendingReference);
  if (pending === undefined) {
    return {
      value: current,
      next: withoutPendingGuidedFollowUp(state, sessionId),
    };
  }
  if (current.operation.capabilities.terminal) {
    return {
      value: projectConversationOperation(pending.source),
      next: promotePendingGuidedFollowUp(state, sessionId),
    };
  }
  return {
    value: { ...current, pendingFollowUp: pending.readModel },
  };
}

export async function readPendingGuidedFollowUp(
  backend: BackendShell,
  reference: TrustedConversationOperationReference,
): Promise<
  | {
      readonly source: Extract<
        BackendConversationOperationReadResult,
        { readonly kind: "found" }
      >;
      readonly readModel: PendingGuidedFollowUpReadModel;
    }
  | undefined
> {
  const source = await backend.commands.readConversationOperation(reference);
  if (source.kind === "missing") return undefined;
  const transcript = await backend.commands.readSessionTranscript({
    sessionId: reference.sessionId,
  });
  const canonicalInput = transcript.rows.find(
    (row) => row.kind === "input" && row.inputId === reference.inputId,
  );
  return {
    source,
    readModel: {
      kind: "product.conversation-guided-follow-up.pending",
      operationId: conversationOperationId(source.reference),
      sessionId: source.reference.sessionId,
      state: source.operation.state,
      text: canonicalInput?.text ?? "",
      createdAt: source.operation.createdAt,
      updatedAt: source.operation.updatedAt,
    },
  };
}

export async function readSubmittedOperation(
  backend: BackendShell,
  receipt: BackendConversationOperationReceipt,
): Promise<ConversationOperationFoundResult> {
  const source = await backend.commands.readConversationOperation(receipt);
  if (source.kind === "found") return projectConversationOperation(source);
  const terminal = terminalStates.has(receipt.state);
  return {
    kind: "product.conversation-operation.found",
    operation: {
      kind: "product.conversation-operation",
      operationId: conversationOperationId(receipt),
      sessionId: receipt.sessionId,
      state: receipt.state,
      createdAt: receipt.submittedAt,
      updatedAt: receipt.submittedAt,
      transcript: { rows: [], totalRows: 0, truncated: false },
      capabilities: {
        cancellable: cancellableStates.has(receipt.state),
        regeneratable: terminal,
        steerable: false,
        terminal,
      },
    },
  };
}

export async function readProviderReadiness(backend: BackendShell) {
  return projectProviderReadiness(await backend.commands.listModelEndpoints());
}

export function untracked(
  sessionId: string | undefined,
): ReadTrackedConversationOperationResult {
  return {
    kind: "product.conversation-operation.untracked",
    ...(sessionId === undefined ? {} : { sessionId }),
    message:
      sessionId === undefined
        ? "select a session before reading its conversation operation"
        : "no conversation operation is tracked for this session",
  };
}

export function rejected(
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

export function normalizeRequiredString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  return value;
}
