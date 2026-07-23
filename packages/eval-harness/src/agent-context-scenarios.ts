import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { prepareAgentContext } from "@wanex/runtime/context"
import { WanexAgentRuntime } from "@wanex/runtime/host"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import type { JsonValue, TextMessagePart } from "@wanex/protocol"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const agentStarterContextContractScenario = createEvalScenario({
  id: "agent.starter-context-contract",
  title: "Cold single-agent starter context composes instructions and skills explicitly",
  tags: ["agent", "instructions", "skills", "product-path"],
  async run(context) {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "wanex-eval-agent-context-"))
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(
      join(workspaceRoot, "AGENTS.md"),
      "Always prefer explicit tests."
    )
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMarkdown({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Full skill body used only after activation."
      })
    )

    try {
      const preparedContext = await prepareAgentContext({
        instructions: {
          cwd,
          projectRoot: workspaceRoot,
          trust: { projectInstructions: "trusted" }
        },
        skills: {
          cwd,
          projectRoot: workspaceRoot,
          trust: { projectSkills: "trusted" },
          registerActivationTool: true
        }
      })
      assert(
        preparedContext.contextCompiler !== undefined,
        "context compiler should be prepared"
      )
      const provider = new SkillActivatingProvider("context skill activated")
      const agent = new WanexAgentRuntime({
        storage: context.storage,
        provider,
        agentContext: preparedContext
      })

      try {
        const result = await agent.submitAndRunUserTurn({
          content: [{ type: "text", text: "use the write-tests skill" }],
          sessionId: "ses_eval_agent_context",
          principalId: "eval-agent-context-user",
          inputId: "inp_eval_agent_context",
          jobId: "job_eval_agent_context",
          maxSteps: 4
        })
        const replayText = textFromReplay(provider.firstMessages)
        const toolResult = result.messages
          .flatMap((message) => message.content)
          .find((part) => part.type === "tool_result")

        assert(
          replayText.includes("Always prefer explicit tests."),
          "instruction content should enter provider replay"
        )
        assert(
          replayText.includes("<available_skills>") &&
            replayText.includes("<name>write-tests</name>"),
          "skill catalog metadata should enter provider replay"
        )
        assert(
          replayText.indexOf("Always prefer explicit tests.") <
            replayText.indexOf("<available_skills>"),
          "instructions should be ordered before skill catalog"
        )
        assert(
          !replayText.includes("Full skill body used only after activation."),
          "full skill body must not be ambient replay context"
        )
        assert(toolResult?.type === "tool_result", "skill activation should run")
        assert(!toolResult.isError, "skill activation should succeed")
        const serializedToolResult = JSON.stringify(toolResult.result)
        assert(
          serializedToolResult.includes("Full skill body used only after activation."),
          "skill activation should return full skill body lazily"
        )

        return {
          sessionId: result.session.id,
          assistantText: assistantTextFromMessages(result.messages, result.turnId),
          providerCalls: provider.calls,
          instructionSources:
            preparedContext.instructionSnapshot?.sources.length ?? 0,
          skillNames:
            preparedContext.skillSnapshot?.sources.map((source) => source.name) ??
            [],
          ambientHasSkillBody: replayText.includes(
            "Full skill body used only after activation."
          ),
          toolActivated: toolResult.type === "tool_result" && !toolResult.isError
        }
      } finally {
        await agent.stop()
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  }
})

async function writeFileRecursive(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, { encoding: "utf8", flush: true })
}

function skillMarkdown(options: {
  readonly name: string
  readonly description: string
  readonly body: string
}): string {
  return [
    "---",
    `name: ${JSON.stringify(options.name)}`,
    `description: ${JSON.stringify(options.description)}`,
    "---",
    "",
    options.body
  ].join("\n")
}

function textFromReplay(messages: readonly ProviderReplayMessage[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function assistantTextFromMessages(
  messages: readonly {
    readonly turnId: string
    readonly role: string
    readonly content: readonly { readonly type: string }[]
  }[],
  turnId: string
): string {
  return messages
    .filter((message) => message.turnId === turnId && message.role === "assistant")
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

class SkillActivatingProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly providerId = "eval-agent-context"
  readonly modelId = "eval-agent-context-model"
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly responseText: string
  firstMessages: readonly ProviderReplayMessage[] = []
  calls = 0

  constructor(responseText: string) {
    this.responseText = responseText
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    if (this.calls === 1) {
      this.firstMessages = request.messages
    }
    if (
      !request.messages.some((message) =>
        message.content.some((part) => part.type === "tool_result")
      )
    ) {
      yield {
        type: "tool_call_start",
        index: 0,
        toolCallId: "call_activate_skill"
      }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_activate_skill",
        toolNameDelta: "activate_skill",
        inputJsonDelta: '{"name":"write-tests"}'
      }
      yield { type: "tool_call_end", toolCallId: "call_activate_skill" }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    yield {
      type: "text_delta",
      partId: "text_eval_agent_context",
      delta: this.responseText
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    }))
  }
}
