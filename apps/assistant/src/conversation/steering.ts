import { createHash } from "node:crypto";
import type { BackendShell } from "@wanex/assistant/backend";
import {
  conversationOperationId,
  projectConversationOperation,
} from "./operation.js";
import {
  resolveSessionId,
  type StateCoordinator,
} from "../state/assistant.js";
import type {
  TrustedConversationOperationReference,
  SteerTrackedConversationOperationRequest,
  SteerTrackedConversationOperationResult,
} from "./model.js";

const MAX_STEERING_TEXT_BYTES = 16_384;
const MAX_IDENTITY_BYTES = 512;

export async function steerTrackedConversationOperation(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: SteerTrackedConversationOperationRequest;
}): Promise<SteerTrackedConversationOperationResult> {
  return await request.state.mutate<SteerTrackedConversationOperationResult>(
    async (state) => {
      const operationId = requiredIdentity(
        request.input.operationId,
        "operationId",
      );
      const text = requiredText(request.input.text);
      const sessionId = resolveSessionId(
        state,
        request.input.sessionId,
      );
      if (sessionId === undefined) {
        return {
          value: rejected(
            "no_session",
            "select a session before guiding the current response",
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
      if (conversationOperationId(reference) !== operationId) {
        return {
          value: rejected(
            "operation_identity_mismatch",
            "the selected conversation operation is no longer current",
            sessionId,
          ),
        };
      }

      const source = await request.backend.commands
        .readConversationOperation(reference);
      if (source.kind === "missing") {
        return {
          value: rejected(
            "operation_not_found",
            "the selected conversation operation no longer exists",
            sessionId,
          ),
        };
      }
      const current = projectConversationOperation(source);
      if (
        source.operation.state !== "running" ||
        source.operation.activeAttemptId === undefined
      ) {
        return {
          value: rejected(
            "steering_not_available",
            "guidance requires a running conversation response",
            sessionId,
            current.operation,
          ),
        };
      }
      const requestId = requiredRequestId(request.input.requestId);
      const idempotencyKey =
        request.input.idempotencyKey ??
        steeringIdempotencyKey(reference, requestId);
      const pending = source.operation.steering?.pending ?? [];
      if (pending.some((item) => item.idempotencyKey === idempotencyKey)) {
        return { value: current };
      }
      if (pending.length > 0) {
        return {
          value: rejected(
            "steering_pending",
            "wait for the current guidance to reach a safe point",
            sessionId,
            current.operation,
          ),
        };
      }

      const partId = steeringPartId(idempotencyKey);
      await request.backend.commands.steerConversationOperation({
        ...reference,
        attemptId: source.operation.activeAttemptId,
        principalId: "assistant-user",
        idempotencyKey,
        content: [{ type: "text", id: partId, text }],
        origin: {
          kind: "interactive",
          sourceRef: "assistant.steer",
          metadata: { operationId },
        },
      });
      const accepted = await request.backend.commands
        .readConversationOperation(reference);
      if (accepted.kind === "missing") {
        throw new Error("accepted conversation guidance is no longer readable");
      }
      return { value: projectConversationOperation(accepted) };
    },
  );
}

function steeringIdempotencyKey(
  reference: TrustedConversationOperationReference,
  requestId: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        requestId,
        reference.sessionId,
        reference.inputId,
        reference.turnId,
        reference.jobId,
      ]),
      "utf8",
    )
    .digest("hex");
  return `assistant:steer:${digest}`;
}

function steeringPartId(idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(idempotencyKey, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `part_assistant_steer_${digest}`;
}

function requiredText(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("steering text must not be empty");
  }
  if (Buffer.byteLength(value, "utf8") > MAX_STEERING_TEXT_BYTES) {
    throw new Error("steering text exceeds 16384 bytes");
  }
  return value;
}

function requiredIdentity(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_IDENTITY_BYTES) {
    throw new Error(`${label} exceeds 512 bytes`);
  }
  return value;
}

function requiredRequestId(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("requestId must not be empty");
  }
  if (Buffer.byteLength(value, "utf8") > 256) {
    throw new Error("requestId exceeds 256 bytes");
  }
  return value;
}

function rejected(
  reason: Extract<
    SteerTrackedConversationOperationResult,
    { readonly kind: "assistant.conversation-operation.rejected" }
  >["reason"],
  message: string,
  sessionId?: string,
  operation?: Extract<
    SteerTrackedConversationOperationResult,
    { readonly kind: "assistant.conversation-operation.found" }
  >["operation"],
): Extract<
  SteerTrackedConversationOperationResult,
  { readonly kind: "assistant.conversation-operation.rejected" }
> {
  return {
    kind: "assistant.conversation-operation.rejected",
    reason,
    message,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operation === undefined ? {} : { operation }),
  };
}
