import type { Shell } from "@wanex/assistant";
import type {
  LocalCapabilitySetupCommands,
  LocalConfigureImageGenerationCapabilityResult,
  LocalSetupImageGenerationAndContinueResult,
} from "../model.js";

export function createLocalCapabilitySetupCommands(options: {
  readonly shell: Shell;
}): LocalCapabilitySetupCommands {
  return {
    async setupImageGenerationAndContinue(request) {
      const current = await options.shell.readTrackedConversationOperation(
        {
          sessionId: request.sessionId,
        },
      );
      if (
        current.kind !== "assistant.conversation-operation.found" ||
        current.operation.operationId !== request.operationId ||
        current.operation.state !== "succeeded"
      ) {
        return rejected(
          "operation_not_current",
          "The capability request is no longer the current completed operation",
        );
      }
      const interaction = current.operation.transcript.rows
        .flatMap((row) => row.capabilityRequests)
        .find(
          (item) => item.operation === request.operation && item.setupRequired,
        );
      if (interaction === undefined) {
        return rejected(
          "capability_request_not_found",
          "The current operation does not request image generation setup",
        );
      }

      let setup;
      try {
        setup = await configureLocalImageGenerationCapability({
          shell: options.shell,
          imageGenerationModelId: request.imageGenerationModelId,
        });
      } catch {
        return rejected(
          "capability_setup_failed",
          "Image generation could not be configured from the active provider",
        );
      }

      const continued = await options.shell.continueCapabilityRequest({
        operationId: request.operationId,
        sessionId: request.sessionId,
        operation: request.operation,
      });
      if (continued.kind !== "assistant.conversation-operation.found") {
        return {
          ...rejected(
            "continuation_rejected",
            "The capability request changed before the conversation could continue",
          ),
          operation: continued,
        };
      }
      return {
        kind: "assistant-host.capability-setup.continued",
        setup,
        operation: continued,
      };
    },
  };
}

export async function configureLocalImageGenerationCapability(
  options: {
    readonly shell: Shell;
    readonly imageGenerationModelId: string;
  },
): Promise<LocalConfigureImageGenerationCapabilityResult> {
  const active = await options.shell.modelEndpoints
    .readActiveModelEndpoint();
  if (active === null) {
    throw new LocalCapabilitySetupError(
      "unsupported_provider",
      "An active conversation provider is required",
    );
  }
  if (
    active.protocol.id !== "openai-chat-completions" ||
    (active.connection.providerId !== "openai" &&
      active.connection.providerId !== "openai-compatible")
  ) {
    throw new LocalCapabilitySetupError(
      "unsupported_provider",
      "The active provider cannot share an OpenAI image generation endpoint",
    );
  }
  if (!active.credentialConfigured) {
    throw new LocalCapabilitySetupError(
      "credential_unavailable",
      "The active provider credential is unavailable",
    );
  }
  const modelId = normalizeCapabilityModelId(options.imageGenerationModelId);
  const endpoint = await options.shell.modelEndpoints
    .upsertSiblingModelEndpoint({
      sourceEndpointId: active.id,
      endpoint: {
        id: `${active.connection.id}.image-generate`,
        protocol: { id: "openai-images" },
        model: {
          id: modelId,
          operations: ["image.generate"],
          inputModalities: ["text"],
          outputModalities: ["image"],
          features: [],
          catalog:
            active.connection.providerId === "openai"
              ? {
                  source: "builtin",
                  catalogId: "openai.images",
                  revision: "2026-07-28",
                }
              : {
                  source: "custom",
                  catalogId: `${active.connection.baseUrl ?? active.connection.id}#images`,
                  revision: "1",
                },
        },
      },
      makeActive: false,
    });
  const readiness =
    await options.shell.modelCapabilities.setModelCapabilityRoute({
      operation: "image.generate",
      modelEndpointId: endpoint.id,
    });
  if (readiness.status !== "ready") {
    throw new LocalCapabilitySetupError(
      "capability_unavailable",
      "Image generation is not executable with the configured endpoint",
    );
  }
  return {
    kind: "assistant-host.image-generation-capability.configured",
    endpoint,
    readiness,
  };
}

export class LocalCapabilitySetupError extends Error {
  constructor(
    readonly code:
      | "unsupported_provider"
      | "credential_unavailable"
      | "capability_unavailable"
      | "invalid_model_id",
    message: string,
  ) {
    super(message);
    this.name = "LocalCapabilitySetupError";
  }
}

function normalizeCapabilityModelId(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 256) {
    throw new LocalCapabilitySetupError(
      "invalid_model_id",
      "Image generation model ID must contain 1 to 256 bytes",
    );
  }
  return normalized;
}

function rejected(
  reason: Extract<
    LocalSetupImageGenerationAndContinueResult,
    { readonly kind: "assistant-host.capability-setup.rejected" }
  >["reason"],
  message: string,
): Extract<
  LocalSetupImageGenerationAndContinueResult,
  { readonly kind: "assistant-host.capability-setup.rejected" }
> {
  return {
    kind: "assistant-host.capability-setup.rejected",
    reason,
    message,
  };
}
