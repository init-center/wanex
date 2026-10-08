import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  prepareAgentContext,
  agentContextProfileToPrepareOptions,
  type AgentContextProfile,
  type PreparedAgentContext
} from "@wanex/runtime/context"
import type { SessionTurnAgentContextLease } from "@wanex/runtime/execution"
import { EchoTool, RiskBoundToolPolicy, ToolRegistry } from "@wanex/runtime/tools"
import { createWanexApp } from "../src/index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

describe("App per-session context resolution", () => {
  it("executes isolated project contexts and reports their persisted evidence", async () => {
    const storeDir = await createStoreDir()
    const globalConfigDir = await createStoreDir()
    await writeFile(join(globalConfigDir, "AGENTS.md"), "SHARED_GLOBAL_RULE")
    const first = await project("first", globalConfigDir)
    const second = await project("second", globalConfigDir)
    const contexts = new Map([
      ["ses_context_first", first.context],
      ["ses_context_second", second.context]
    ])
    const compiled = new Map<string, string>()
    const commit = vi.fn()
    const rollback = vi.fn()
    const defaults: (PreparedAgentContext | undefined)[] = []
    const policy = new RiskBoundToolPolicy(["read_only"])
    const tools = new ToolRegistry()
    tools.register(new EchoTool())
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      agentContextProfile: first.profile,
      workerCount: 2,
      runtimeContext: { tools, toolPermissionPolicy: policy },
      runtimeContextResolver(request, defaultContext) {
        defaults.push(defaultContext)
        const selected = contexts.get(request.sessionId)
        if (selected === undefined) return undefined
        return {
          context: {
            ...selected,
            toolPermissionPolicy: defaultContext?.toolPermissionPolicy ?? policy,
            contextCompiler: {
              async compile(input) {
                const result = await selected.contextCompiler!.compile(input)
                compiled.set(request.sessionId, JSON.stringify(result.messages))
                return result
              }
            }
          },
          ...(request.phase !== "admission" ? {} : {
            lease: { phase: "admission", commit, rollback } satisfies SessionTurnAgentContextLease
          })
        }
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service", mode: "persistent", storeDir, serviceBin
    })
    try {
      const [firstResult, secondResult] = await Promise.all([
        app.commands.runAgentTurn({
          sessionId: "ses_context_first",
          content: [{ type: "text", text: "use first project" }]
        }),
        app.commands.runAgentTurn({
          sessionId: "ses_context_second",
          content: [{ type: "text", text: "use second project" }]
        })
      ])
      for (const [name, result] of [["first", firstResult], ["second", secondResult]] as const) {
        const messages = compiled.get(result.sessionId)
        expect(messages).toContain("SHARED_GLOBAL_RULE")
        expect(messages).toContain(`PROJECT_${name}_RULE`)
        expect(messages).toContain(`${name}-skill`)
        expect(messages).not.toContain(`PROJECT_${name === "first" ? "second" : "first"}_RULE`)
        expect(messages).not.toContain(`${name === "first" ? "second" : "first"}-skill`)
        const [turn] = await storage.listSessionTurns({ sessionId: result.sessionId })
        expect(turn?.state).toBe("succeeded")
        expect(result.contextEvidence).toEqual(turn?.executionBinding.contextEvidence)
        expect(result.contextEvidence).toMatchObject({
          instructions: { sourceCount: 2, state: "available" },
          skills: { sourceCount: 1, state: "available" }
        })
        expect(JSON.stringify(turn?.executionBinding.toolSnapshot)).toContain("activate_skill")
        expect(JSON.stringify(turn?.executionBinding.toolSnapshot)).not.toContain('"name":"echo"')
        expect(JSON.stringify(result)).not.toContain(`PROJECT_${name}_RULE`)
      }
      expect(firstResult.contextEvidence?.instructions?.digest).not.toBe(
        secondResult.contextEvidence?.instructions?.digest
      )
      expect(firstResult.contextEvidence?.skills?.digest).not.toBe(
        secondResult.contextEvidence?.skills?.digest
      )
      expect(commit).toHaveBeenCalledTimes(2)
      expect(rollback).not.toHaveBeenCalled()
      expect(defaults.every((context) => context?.toolPermissionPolicy === policy)).toBe(true)
      expect(defaults.every((context) => context?.tools?.get("echo") !== undefined)).toBe(true)
      expect(app.status().agentContext).toMatchObject({
        revision: 1, context: { skillNames: ["first-skill"] }
      })

      const fallback = await app.commands.runAgentTurn({
        sessionId: "ses_context_default",
        content: [{ type: "text", text: "keep defaults" }]
      })
      expect(fallback.contextEvidence).toEqual(firstResult.contextEvidence)
      const [defaultTurn] = await storage.listSessionTurns({ sessionId: fallback.sessionId })
      expect(JSON.stringify(defaultTurn?.executionBinding.toolSnapshot)).toContain('"name":"echo"')

      contexts.set(firstResult.sessionId, second.context)
      const followUp = await app.commands.runAgentTurn({
        sessionId: firstResult.sessionId,
        content: [{ type: "text", text: "now use the second project in this conversation" }]
      })
      expect(followUp.sessionId).toBe(firstResult.sessionId)
      expect(followUp.contextEvidence).toEqual(secondResult.contextEvidence)
      expect(compiled.get(firstResult.sessionId)).toContain("use first project")
      const turns = await storage.listSessionTurns({ sessionId: firstResult.sessionId })
      expect(turns).toHaveLength(2)
      expect(turns.map((turn) => turn.executionBinding.contextEvidence)).toEqual([
        firstResult.contextEvidence, secondResult.contextEvidence
      ])
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  })

  it("rejects changed context at execution instead of running a new project's compiler", async () => {
    const storeDir = await createStoreDir()
    const globalDir = await createStoreDir()
    const first = await project("admitted", globalDir)
    const second = await project("changed", globalDir)
    const compile = vi.fn(second.context.contextCompiler!.compile.bind(second.context.contextCompiler))
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      runtimeContextResolver(request) {
        return {
          context: request.phase === "admission" ? first.context : {
            ...second.context, contextCompiler: { compile }
          }
        }
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service", mode: "persistent", storeDir, serviceBin
    })
    try {
      await expect(app.commands.runAgentTurn({
        sessionId: "ses_context_changed",
        content: [{ type: "text", text: "must not change context" }]
      })).rejects.toThrow("agent turn failed")
      expect(compile).not.toHaveBeenCalled()
      const [turn] = await storage.listSessionTurns({ sessionId: "ses_context_changed" })
      expect(turn?.state).toBe("failed")
      expect(turn).toBeDefined()
      expect(turn?.error).toMatchObject({
        message: "resolved agent context does not match the admitted turn binding"
      })
      const messages = await storage.listSessionMessages({ sessionId: "ses_context_changed" })
      expect(messages.filter((message) => message.role === "assistant")).toEqual([])
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  })

  it("rolls back the resolver lease if downstream capability composition fails", async () => {
    const storeDir = await createStoreDir()
    const commit = vi.fn()
    const rollback = vi.fn()
    const tools = new ToolRegistry()
    const echo = new EchoTool()
    tools.register({ ...echo, name: "image_generate", invoke: echo.invoke.bind(echo) })
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      runtimeContextResolver() {
        return { context: { tools }, lease: { phase: "admission", commit, rollback } }
      }
    })
    try {
      await expect(app.trustedExecution.prepareExecutionBinding({
        sessionId: "ses_context_collision", inputId: "input_context_collision",
        turnId: "turn_context_collision",
        content: [{ id: "part_context_collision", type: "text", text: "reject duplicate tool" }]
      })).rejects.toThrow("tool already registered: image_generate")
      expect(rollback).toHaveBeenCalledTimes(1)
      expect(commit).not.toHaveBeenCalled()
    } finally {
      await app.dispose()
    }
  })

  it("does not retain default instructions or skills when explicitly replaced by an empty context", async () => {
    const storeDir = await createStoreDir()
    const globalDir = await createStoreDir()
    const configured = await project("default", globalDir)
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      agentContextProfile: configured.profile,
      runtimeContextResolver: () => ({ context: {} })
    })
    const storage = createStorageTestStore({
      kind: "local-system-service", mode: "persistent", storeDir, serviceBin
    })
    try {
      const result = await app.commands.runAgentTurn({
        sessionId: "ses_context_empty",
        content: [{ type: "text", text: "no project context" }]
      })
      expect(result.contextEvidence).toBeUndefined()
      expect(result).not.toHaveProperty("context")
      const [turn] = await storage.listSessionTurns({ sessionId: result.sessionId })
      expect(turn?.state).toBe("succeeded")
      expect(turn?.executionBinding.contextEvidence).toBeUndefined()
      expect(JSON.stringify(turn?.executionBinding.toolSnapshot)).not.toContain("activate_skill")
      expect(app.status().agentContext.context?.skillNames).toEqual(["default-skill"])
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  })
})

async function project(name: string, globalConfigDir: string): Promise<{
  profile: AgentContextProfile
  context: PreparedAgentContext
}> {
  const root = await createStoreDir()
  const skillDir = join(root, ".agents", "skills", `${name}-skill`)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(root, "AGENTS.md"), `PROJECT_${name}_RULE`)
  await writeFile(join(skillDir, "SKILL.md"), [
    "---", `name: ${name}-skill`, `description: Rules for ${name}`, "---", "", `PRIVATE_${name}_SKILL_BODY`
  ].join("\n"))
  const profile: AgentContextProfile = {
    instructions: { cwd: root, projectRoot: root, globalConfigDir, trustProject: true },
    skills: { cwd: root, projectRoot: root, trustProject: true, registerActivationTool: true }
  }
  return { profile, context: await prepareAgentContext(agentContextProfileToPrepareOptions(profile)) }
}
