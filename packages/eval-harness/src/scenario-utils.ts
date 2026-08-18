import { basename, dirname } from "node:path"
import { execPath } from "node:process"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import type {
  JsonValue,
  ModelEndpoint,
  ModelFeature,
  ModelInputModality,
  TextMessagePart
} from "@wanex/protocol"
import { fakeModelDescriptor } from "@wanex/runtime/provider"
import {
  type PluginInstallPlan,
  WANEX_PLUGIN_INSTALL_PLAN_KIND,
  WANEX_PLUGIN_PACKAGE_LAYOUT_KIND,
  WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND
} from "@wanex/plugin"
import type { EvalStore } from "./eval-storage.js"

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function evalFakeModelEndpoint(
  id: string,
  modelId: string,
  providerId = "fake",
  options: {
    readonly inputModalities?: readonly ModelInputModality[]
    readonly features?: readonly ModelFeature[]
    readonly secretRef?: string
  } = {}
): ModelEndpoint {
  return {
    id,
    connection: {
      id,
      providerId,
      ...(options.secretRef === undefined ? {} : { secretRef: options.secretRef })
    },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: options.inputModalities ?? ["text"],
      outputModalities: ["text"],
      features: options.features ?? [],
      catalog: {
        source: "builtin",
        catalogId: `eval.fake.${id}`,
        revision: "1"
      }
    }
  }
}

export function evalOpenAICompatibleModelEndpoint(request: {
  readonly id: string
  readonly modelId: string
  readonly providerId?: string
  readonly baseUrl: string
  readonly secretRef?: string
  readonly inputModalities?: readonly ModelInputModality[]
  readonly features?: readonly ModelFeature[]
  readonly reasoningReplay?: "optional" | "required" | "forbidden"
}): ModelEndpoint {
  return {
    id: request.id,
    connection: {
      id: request.id,
      providerId: request.providerId ?? "openai-compatible",
      baseUrl: request.baseUrl,
      ...(request.secretRef === undefined ? {} : { secretRef: request.secretRef })
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: request.modelId,
      operations: ["conversation"],
      inputModalities: request.inputModalities ?? ["text"],
      outputModalities: ["text"],
      features: request.features ?? ["tool_calling"],
      ...(request.reasoningReplay === undefined
        ? {}
        : { behavior: { reasoningReplay: request.reasoningReplay } }),
      catalog: {
        source: "custom",
        catalogId: `eval.${request.id}`,
        revision: "1"
      }
    }
  }
}

export function evalPluginInstallPlan(pluginHostFixture: string): PluginInstallPlan {
  return {
    kind: WANEX_PLUGIN_INSTALL_PLAN_KIND,
    layout: {
      kind: WANEX_PLUGIN_PACKAGE_LAYOUT_KIND,
      pluginId: "eval.plugin.echo",
      version: "1.0.0",
      name: "Eval Echo Plugin",
      entry: {
        kind: WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND,
        command: basename(execPath),
        args: [pluginHostFixture],
        timeoutMs: 1_000,
        actions: [
          {
            actionId: "echo",
            capability: "config.read"
          }
        ]
      },
      capabilities: ["config.read"]
    },
    source: {
      kind: "local",
      uri: "file:///plugins/eval.plugin.echo"
    },
    signature: {
      kind: "local-dev",
      verified: true
    },
    install: {
      rootDir: dirname(execPath)
    },
    decision: {
      status: "allow"
    }
  }
}

export async function putRequestedCreateProposal(
  storage: EvalStore,
  options: {
    readonly proposalId: string
    readonly changeSetId: string
    readonly targetText: string
  }
): Promise<void> {
  await storage.putWorkspaceChangeSet({
    workspaceId: "eval_workspace",
    principalId: "agent_eval_workspace",
    changeSet: {
      id: options.changeSetId,
      changes: [
        {
          path: "shared.txt",
          kind: "create",
          targetText: options.targetText
        }
      ]
    }
  })
  await storage.putWorkspaceChangeProposal({
    id: options.proposalId,
    workspaceId: "eval_workspace",
    principalId: "agent_eval_workspace",
    changeSetId: options.changeSetId
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: options.proposalId,
    operation: "approve",
    actorId: "eval-reviewer"
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: options.proposalId,
    operation: "request_apply",
    actorId: "eval-reviewer"
  })
}

export class EvalFailingProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "eval-provider"
  readonly model = fakeModelDescriptor("eval-model")

  constructor(private readonly failingText: string) {}

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const text = userText(request.messages)
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (text === this.failingText) {
      yield {
        type: "error",
        error: {
          category: "unknown",
          message: `planned eval provider failure: ${text}`,
          retryable: false,
          providerId: this.providerId,
          modelId: this.model.id,
          phase: "request"
        }
      }
      return
    }
    yield* textEvents(`ok: ${text}`)
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    }))
  }
}

function userText(messages: readonly ProviderReplayMessage[]): string {
  return (
    messages
      .flatMap((message) => message.content)
      .filter((part): part is TextMessagePart => part.type === "text")
      .map((part) => part.text)
      .at(-1) ?? ""
  )
}

function* textEvents(text: string): Iterable<ProviderEvent> {
  yield {
    type: "text_delta",
    partId: `text_${text.replaceAll(/\W+/g, "_")}`,
    delta: text
  }
  yield { type: "finish", reason: "stop" }
}
