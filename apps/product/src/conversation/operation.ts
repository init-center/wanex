import type { UserMessageInputPart } from "@wanex/protocol";
import type { BackendShell } from "@wanex/product/backend";
import { providerNotReadyError } from "../provider/readiness.js";
import {
  resolveSessionId,
  withTrackedConversationOperation,
  type MutableState,
  type StateCoordinator,
} from "../state/product.js";
import type {
  CancelTrackedConversationOperationRequest,
  CancelTrackedConversationOperationResult,
  ContinueCapabilityRequestRequest,
  ContinueCapabilityRequestResult,
  ReadTrackedConversationOperationRequest,
  ReadTrackedConversationOperationResult,
  RegenerateTrackedConversationOperationRequest,
  RegenerateTrackedConversationOperationResult,
  SubmitConversationOperationRequest,
  SubmitConversationOperationResult,
} from "./model.js";
import {
  attachmentDraftsForConversation,
  clearAttachmentDraftsForConversation,
} from "../attachments/service.js";
import type { AttachmentDraft } from "../attachments/model.js";
import {
  conversationOperationId,
  projectConversationOperation,
} from "./projection.js";
import {
  normalizeRequiredString,
  readProviderReadiness,
  readSubmittedOperation,
  readTrackedOperation,
  readTrackedOperationWithPromotion,
  rejected,
  sourceConversationContent,
  untracked,
} from "./tracking.js";

export { queueGuidedFollowUp } from "./guided-follow-up.js";
export {
  conversationApprovalId,
  conversationOperationId,
  conversationRecoveryId,
  conversationSteeringId,
  projectCapabilityRequests,
  projectConversationOperation,
} from "./projection.js";

export async function submitConversationOperation(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: SubmitConversationOperationRequest;
}): Promise<SubmitConversationOperationResult> {
  return await request.state.mutate<SubmitConversationOperationResult>(
    async (state) => {
      const sessionId = resolveSessionId(state, request.input.sessionId);
      const attachments = attachmentDraftsForConversation(state, sessionId);
      const content = conversationContent(request.input.text, attachments);
      const readiness = await readProviderReadiness(request.backend);
      if (!readiness.canRun) {
        return {
          value: rejected(
            "provider_not_ready",
            providerNotReadyError(readiness).message,
            sessionId,
          ),
        };
      }

      const unsupported = unsupportedAttachment(attachments, readiness);
      if (unsupported !== undefined) {
        return {
          value: rejected(
            "unsupported_attachment",
            `active provider does not support ${unsupported} attachment input`,
            sessionId,
          ),
        };
      }

      if (sessionId !== undefined) {
        const active = await readTrackedOperation(
          request.backend,
          state,
          sessionId,
        );
        if (state.pendingGuidedFollowUps[sessionId] !== undefined) {
          return {
            value: rejected(
              "operation_active",
              "wait for the queued guided follow-up before submitting another message",
              sessionId,
              active.kind === "product.conversation-operation.found"
                ? active.operation
                : undefined,
            ),
          };
        }
        if (
          active.kind === "product.conversation-operation.found" &&
          !active.operation.capabilities.terminal
        ) {
          return {
            value: rejected(
              "operation_active",
              "wait for or cancel the active conversation operation before submitting another message",
              sessionId,
              active.operation,
            ),
          };
        }
      }

      const receipt =
        await request.backend.commands.submitConversationOperation({
          content,
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(request.input.principalId === undefined
            ? {}
            : { principalId: request.input.principalId }),
          origin: { kind: "interactive", sourceRef: "product" },
          intent: "normal",
        });
      const next = clearAttachmentDraftsForConversation(
        withTrackedConversationOperation(state, receipt),
        sessionId,
      );
      return {
        value: await readSubmittedOperation(request.backend, receipt),
        next,
      };
    },
  );
}

export async function readTrackedConversationOperation(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: ReadTrackedConversationOperationRequest;
}): Promise<ReadTrackedConversationOperationResult> {
  const sessionId = resolveSessionId(
    request.state.state,
    request.input.sessionId,
  );
  if (sessionId === undefined) return untracked(undefined);
  return await request.state.mutate(
    async (state) =>
      await readTrackedOperationWithPromotion(
        request.backend,
        state,
        sessionId,
      ),
  );
}

export async function cancelTrackedConversationOperation(request: {
  readonly backend: BackendShell;
  readonly state: MutableState;
  readonly input: CancelTrackedConversationOperationRequest;
}): Promise<CancelTrackedConversationOperationResult> {
  const sessionId = resolveSessionId(request.state, request.input.sessionId);
  if (sessionId === undefined) {
    return {
      kind: "product.conversation-operation.cancel",
      status: "untracked",
      operation: untracked(undefined),
    };
  }
  const reference = request.state.trackedConversationOperations[sessionId];
  if (reference === undefined) {
    return {
      kind: "product.conversation-operation.cancel",
      status: "untracked",
      operation: untracked(sessionId),
    };
  }
  const receipt = await request.backend.commands.cancelConversationOperation({
    ...reference,
    reason: normalizeRequiredString(request.input.reason, "cancel reason"),
  });
  return {
    kind: "product.conversation-operation.cancel",
    status: receipt.status,
    operation: await readTrackedOperation(
      request.backend,
      request.state,
      sessionId,
    ),
  };
}

export async function regenerateTrackedConversationOperation(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: RegenerateTrackedConversationOperationRequest;
}): Promise<RegenerateTrackedConversationOperationResult> {
  return await request.state.mutate<RegenerateTrackedConversationOperationResult>(
    async (state) => {
      const sessionId = resolveSessionId(state, request.input.sessionId);
      if (sessionId === undefined) {
        return {
          value: rejected("no_session", "select a session before regenerating"),
        };
      }
      const reference = state.trackedConversationOperations[sessionId];
      if (reference === undefined) {
        return {
          value: rejected(
            "operation_not_found",
            "no tracked conversation operation exists for this session",
            sessionId,
          ),
        };
      }
      if (state.pendingGuidedFollowUps[sessionId] !== undefined) {
        const active = await readTrackedOperation(
          request.backend,
          state,
          sessionId,
        );
        return {
          value: rejected(
            "operation_not_terminal",
            "wait for the queued guided follow-up before regenerating",
            sessionId,
            active.kind === "product.conversation-operation.found"
              ? active.operation
              : undefined,
          ),
        };
      }
      const source =
        await request.backend.commands.readConversationOperation(reference);
      if (source.kind === "missing") {
        return {
          value: rejected(
            "operation_not_found",
            "the tracked conversation operation no longer exists",
            sessionId,
          ),
        };
      }
      const projected = projectConversationOperation(source);
      if (!projected.operation.capabilities.terminal) {
        return {
          value: rejected(
            "operation_not_terminal",
            "only a terminal conversation operation can be regenerated",
            sessionId,
            projected.operation,
          ),
        };
      }
      const sourceContent = sourceConversationContent(source, reference.inputId);
      if (sourceContent === undefined || sourceContent.length === 0) {
        return {
          value: rejected(
            "source_input_missing",
            "the canonical source user input is unavailable",
            sessionId,
            projected.operation,
          ),
        };
      }
      const readiness = await readProviderReadiness(request.backend);
      if (!readiness.canRun) {
        return {
          value: rejected(
            "provider_not_ready",
            providerNotReadyError(readiness).message,
            sessionId,
            projected.operation,
          ),
        };
      }
      const receipt =
        await request.backend.commands.submitConversationOperation({
          content: sourceContent,
          sessionId,
          ...(request.input.principalId === undefined
            ? {}
            : { principalId: request.input.principalId }),
          regeneratesTurnId: reference.turnId,
          origin: {
            kind: "interactive",
            sourceRef: "product.regenerate",
            metadata: { operationId: conversationOperationId(reference) },
          },
          intent: "normal",
        });
      return {
        value: await readSubmittedOperation(request.backend, receipt),
        next: withTrackedConversationOperation(state, receipt),
      };
    },
  );
}

export async function continueCapabilityRequest(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: ContinueCapabilityRequestRequest;
}): Promise<ContinueCapabilityRequestResult> {
  return await request.state.mutate<ContinueCapabilityRequestResult>(
    async (state) => {
      const sessionId = resolveSessionId(state, request.input.sessionId);
      if (sessionId === undefined) {
        return {
          value: rejected(
            "no_session",
            "select a session before continuing capability setup",
          ),
        };
      }
      const reference = state.trackedConversationOperations[sessionId];
      if (reference === undefined) {
        return {
          value: rejected(
            "operation_not_found",
            "no tracked conversation operation exists for this session",
            sessionId,
          ),
        };
      }
      if (conversationOperationId(reference) !== request.input.operationId) {
        return {
          value: rejected(
            "operation_identity_mismatch",
            "the capability request operation is no longer current",
            sessionId,
          ),
        };
      }
      if (state.pendingGuidedFollowUps[sessionId] !== undefined) {
        return {
          value: rejected(
            "operation_not_terminal",
            "wait for the queued guided follow-up before continuing capability setup",
            sessionId,
          ),
        };
      }
      const source =
        await request.backend.commands.readConversationOperation(reference);
      if (source.kind === "missing") {
        return {
          value: rejected(
            "operation_not_found",
            "the capability request operation no longer exists",
            sessionId,
          ),
        };
      }
      const projected = projectConversationOperation(source);
      if (source.operation.state !== "succeeded") {
        return {
          value: rejected(
            "operation_not_terminal",
            "capability continuation requires a succeeded source operation",
            sessionId,
            projected.operation,
          ),
        };
      }
      const interaction = projected.operation.transcript.rows
        .flatMap((row) => row.capabilityRequests)
        .find((item) => item.operation === request.input.operation);
      if (interaction === undefined || !interaction.setupRequired) {
        return {
          value: rejected(
            "capability_request_not_found",
            "the source operation does not contain the requested setup interaction",
            sessionId,
            projected.operation,
          ),
        };
      }
      const readiness = await Promise.all(
        interaction.requirements.map(
          async (item) =>
            await request.backend.commands.readModelCapabilityReadiness({
              requirement: item.requirement,
            }),
        ),
      );
      if (readiness.some((item) => item.status !== "ready")) {
        return {
          value: rejected(
            "capability_not_ready",
            `model capability is still not ready: ${request.input.operation}`,
            sessionId,
            projected.operation,
          ),
        };
      }
      const sourceContent = sourceConversationContent(source, reference.inputId);
      if (sourceContent === undefined || sourceContent.length === 0) {
        return {
          value: rejected(
            "source_input_missing",
            "the canonical source user input is unavailable",
            sessionId,
            projected.operation,
          ),
        };
      }
      const providerReadiness = await readProviderReadiness(request.backend);
      if (!providerReadiness.canRun) {
        return {
          value: rejected(
            "provider_not_ready",
            providerNotReadyError(providerReadiness).message,
            sessionId,
            projected.operation,
          ),
        };
      }
      const receipt =
        await request.backend.commands.submitConversationOperation({
          content: sourceContent,
          sessionId,
          ...(request.input.principalId === undefined
            ? {}
            : { principalId: request.input.principalId }),
          regeneratesTurnId: reference.turnId,
          origin: {
            kind: "interactive",
            sourceRef: "product.capability-continuation",
            metadata: {
              operationId: conversationOperationId(reference),
              capability: request.input.operation,
            },
          },
          intent: "normal",
        });
      return {
        value: await readSubmittedOperation(request.backend, receipt),
        next: withTrackedConversationOperation(state, receipt),
      };
    },
  );
}

function conversationContent(
  text: string,
  attachments: readonly AttachmentDraft[],
): UserMessageInputPart[] {
  if (typeof text !== "string") {
    throw new Error("conversation text must be a string");
  }
  const content: UserMessageInputPart[] = [];
  if (text.trim().length > 0) content.push({ type: "text", text });
  content.push(
    ...attachments.map((attachment) => ({
      type: "resource" as const,
      resourceId: attachment.resourceId,
    })),
  );
  if (content.length === 0) {
    throw new Error("conversation requires text or an attachment");
  }
  return content;
}

function unsupportedAttachment(
  attachments: readonly AttachmentDraft[],
  readiness: Awaited<ReturnType<typeof readProviderReadiness>>,
): string | undefined {
  const supported = new Set(
    readiness.activeEndpoint?.model.inputModalities ?? [],
  );
  return attachments
    .map(attachmentModality)
    .find((modality) => !supported.has(modality));
}

function attachmentModality(
  attachment: AttachmentDraft,
): "image" | "audio" | "video" | "document" {
  if (attachment.resourceKind === "image") return "image";
  if (attachment.resourceKind === "audio") return "audio";
  if (attachment.resourceKind === "video") return "video";
  return "document";
}
