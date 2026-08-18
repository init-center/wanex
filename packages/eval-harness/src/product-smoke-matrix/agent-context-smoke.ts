import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  agentContextProfileToPrepareOptions,
  prepareAgentContext
} from "@wanex/runtime/context"
import { WanexAgentRuntime } from "@wanex/runtime/host"
import { writeModelEndpoint } from "@wanex/runtime/provider"
import type { EvalStore } from "../eval-storage.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import { skillMarkdown, writeFileRecursive } from "./file-helpers.js"
import { assistantTextFromMessages } from "./message-text.js"

export async function runAgentContextProfileSmoke(
  storage: EvalStore
): Promise<{
  readonly sessionId: string
  readonly assistantText: string
  readonly instructionSources: number
  readonly skillNames: readonly string[]
  readonly leakedSkillBody: boolean
}> {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "wanex-product-matrix-agent-context-")
  )
  const cwd = join(workspaceRoot, "apps/product-matrix")
  await writeFileRecursive(
    join(workspaceRoot, "AGENTS.md"),
    "Use product matrix context."
  )
  await writeFileRecursive(
    join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
    skillMarkdown({
      name: "write-tests",
      description: "Write focused tests.",
      body: "FULL PRODUCT MATRIX SKILL BODY"
    })
  )
  try {
    const prepared = await prepareAgentContext(
      agentContextProfileToPrepareOptions({
        instructions: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true
        },
        skills: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      })
    )
    await writeModelEndpoint(
      storage,
      evalFakeModelEndpoint(
        "product-matrix-context-profile",
        "product-matrix-context-model"
      )
    )
    const agent = new WanexAgentRuntime({
      storage,
      modelEndpointId: "product-matrix-context-profile",
      ...(prepared.contextCompiler === undefined
        ? {}
        : { contextCompiler: prepared.contextCompiler }),
      ...(prepared.tools === undefined ? {} : { tools: prepared.tools }),
      ...(prepared.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: prepared.toolPermissionPolicy })
    })
    try {
      const result = await agent.submitAndRunUserTurn({
        content: [{ type: "text", text: "product matrix context profile" }],
        sessionId: "ses_product_matrix_agent_context",
        principalId: "principal_product_matrix",
        inputId: "inp_product_matrix_agent_context",
        jobId: "job_product_matrix_agent_context"
      })
      const output = {
        sessionId: result.session.id,
        assistantText: assistantTextFromMessages(result.messages, result.turnId),
        instructionSources: prepared.instructionSnapshot?.sources.length ?? 0,
        skillNames:
          prepared.skillSnapshot?.complete === true
            ? prepared.skillSnapshot.sources.map((source) => source.name)
            : [],
        leakedSkillBody: JSON.stringify(result.messages).includes(
          "FULL PRODUCT MATRIX SKILL BODY"
        )
      }
      assert(!output.leakedSkillBody, "full skill body must not leak in messages")
      return output
    } finally {
      await agent.stop()
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
}
