import { createHash } from "node:crypto";
import type { BackendShell } from "@wanex/product/backend";
import { providerNotReadyError } from "../provider/readiness.js";
import {
  promotePendingGuidedFollowUp,
  resolveSessionId,
  withPendingGuidedFollowUp,
  type StateCoordinator,
} from "../state/product.js";
import type {
  QueueGuidedFollowUpRequest,
  QueueGuidedFollowUpResult,
  TrustedConversationOperationReference,
} from "./model.js";
import {
  conversationOperationId,
  projectConversationOperation,
} from "./projection.js";
import {
  normalizeRequiredString,
  readPendingGuidedFollowUp,
  readProviderReadiness,
  rejected,
} from "./tracking.js";

const guidedFollowUpStates = new Set([
  "queued",
  "running",
  "waiting",
  "cancel_requested",
]);

export async function queueGuidedFollowUp(request: {
  readonly backend: BackendShell;
  readonly state: StateCoordinator;
  readonly input: QueueGuidedFollowUpRequest;
}): Promise<QueueGuidedFollowUpResult> {
  return await request.state.mutate<QueueGuidedFollowUpResult>(
    async (state) => {
      const operationId = normalizeRequiredString(
        request.input.operationId,
        "operationId",
      );
      const text = normalizeRequiredString(request.input.text, "follow-up text");
      const sessionId = resolveSessionId(state, request.input.sessionId);
      if (sessionId === undefined) {
        return {
          value: rejected(
            "no_session",
            "select a session before queueing a guided follow-up",
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

      const source =
        await request.backend.commands.readConversationOperation(reference);
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
      if (state.pendingGuidedFollowUps[sessionId] !== undefined) {
        return {
          value: rejected(
            "guided_follow_up_pending",
            "a guided follow-up is already queued for this conversation",
            sessionId,
            current.operation,
          ),
        };
      }
      const identity = guidedFollowUpAdmissionIdentity(reference);
      const recovered = await recoverAdmittedGuidedFollowUp(
        request.backend,
        sessionId,
        identity,
      );
      if (recovered !== undefined) {
        const recoveredState = withPendingGuidedFollowUp(
          state,
          recovered.source.reference,
        );
        return current.operation.capabilities.terminal
          ? {
              value: projectConversationOperation(recovered.source),
              next: promotePendingGuidedFollowUp(recoveredState, sessionId),
            }
          : {
              value: { ...current, pendingFollowUp: recovered.readModel },
              next: recoveredState,
            };
      }
      if (!guidedFollowUpStates.has(source.operation.state)) {
        return {
          value: rejected(
            "guided_follow_up_not_available",
            "guided follow-up requires a queued or active conversation operation",
            sessionId,
            current.operation,
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
            current.operation,
          ),
        };
      }

      const admitted = await request.backend.commands.queueGuidedFollowUp({
        text,
        sessionId,
        activeTurnId: reference.turnId,
        sourceRef: "product.guided-follow-up",
        inputId: identity.inputId,
        turnId: identity.turnId,
        idempotencyKey: identity.inputIdempotencyKey,
        jobId: identity.jobId,
        jobIdempotencyKey: identity.jobIdempotencyKey,
      });
      const pendingReference = admitted.receipt;
      const pending = await readPendingGuidedFollowUp(
        request.backend,
        pendingReference,
      );
      if (pending === undefined) {
        throw new Error("admitted guided follow-up is not canonically readable");
      }
      return {
        value: { ...current, pendingFollowUp: pending.readModel },
        next: withPendingGuidedFollowUp(state, pendingReference),
      };
    },
  );
}

function guidedFollowUpAdmissionIdentity(
  reference: TrustedConversationOperationReference,
): {
  readonly inputId: string;
  readonly turnId: string;
  readonly inputIdempotencyKey: string;
  readonly jobId: string;
  readonly jobIdempotencyKey: string;
} {
  const digest = createHash("sha256")
    .update(
      [
        reference.sessionId,
        reference.inputId,
        reference.turnId,
        reference.jobId,
        "guided-follow-up",
      ].join("\u0000"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
  return {
    inputId: `inp_product_guided_${digest}`,
    turnId: `turn_product_guided_${digest}`,
    inputIdempotencyKey: `product:guided-input:${digest}`,
    jobId: `job_product_guided_${digest}`,
    jobIdempotencyKey: `product:guided-job:${digest}`,
  };
}

async function recoverAdmittedGuidedFollowUp(
  backend: BackendShell,
  sessionId: string,
  identity: ReturnType<typeof guidedFollowUpAdmissionIdentity>,
): Promise<Awaited<ReturnType<typeof readPendingGuidedFollowUp>>> {
  return await readPendingGuidedFollowUp(backend, {
    sessionId,
    inputId: identity.inputId,
    turnId: identity.turnId,
    jobId: identity.jobId,
  });
}
