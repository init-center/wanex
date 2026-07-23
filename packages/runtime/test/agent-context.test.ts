import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { SKILL_ACTIVATION_TOOL_NAME } from "../src/context/skill/index.js"
import {
  agentContextProfileFromJson,
  agentContextProfileToJson,
  agentContextProfileToPrepareOptions,
  assertAgentContextProfile,
  prepareAgentContext
} from "../src/context/agent/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/context agent", () => {
  it("composes instructions before skill catalog and prepares activation tool", async () => {
    const workspaceRoot = await mktemp("wanex-agent-context-runtime-")
    const cwd = join(workspaceRoot, "packages/app")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Root instruction")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMd({
        name: "write-tests",
        description: "Write tests.",
        body: "Full skill body"
      })
    )

    const prepared = await prepareAgentContext({
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

    expect(prepared.instructionSnapshot?.sources).toHaveLength(1)
    expect(prepared.skillSnapshot?.sources.map((source) => source.name)).toEqual([
      "write-tests"
    ])
    await expect(prepared.toolPermissionPolicy?.authorize({
      ...toolIdentity("call_policy"),
      call: {
        type: "tool_call",
        id: "part_policy",
        toolCallId: "call_policy",
        toolName: SKILL_ACTIVATION_TOOL_NAME,
        input: { name: "write-tests" }
      },
      descriptor: prepared.tools!.list()[0]!
    })).resolves.toMatchObject({ status: "allow" })
    const compiled = await prepared.contextCompiler?.compile({
      sessionId: "ses_agent_context",
      inputs: [
        {
          id: "inp_user",
          sessionId: "ses_agent_context",
          principalId: "principal",
          idempotencyKey: "input",
          inputType: "user",
          content: [{ type: "text", id: "part_user", text: "hello" }],
          status: "completed",
          createdAt: 10,
          updatedAt: 10
        }
      ],
      messages: []
    })
    const text = compiled?.messages
      .flatMap((message) => message.content)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    expect(text?.indexOf("Root instruction")).toBeLessThan(
      text?.indexOf("<available_skills>") ?? -1
    )
    expect(text).toContain("<name>write-tests</name>")
    expect(text).not.toContain("Full skill body")

    const toolResult = await prepared.tools?.get(SKILL_ACTIVATION_TOOL_NAME)?.invoke({
      toolCallId: "call_skill",
      toolName: SKILL_ACTIVATION_TOOL_NAME,
      input: { name: "write-tests" },
      ...toolIdentity("call_skill")
    })
    expect(toolResult).toMatchObject({
      isError: false,
      result: {
        name: "write-tests",
        output: expect.stringContaining("Full skill body")
      }
    })
  })

  it("keeps untrusted project skills out of the catalog and activation tool", async () => {
    const workspaceRoot = await mktemp("wanex-agent-context-runtime-untrusted-")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/project-skill/SKILL.md"),
      skillMd({
        name: "project-skill",
        description: "Project skill.",
        body: "Do not load"
      })
    )

    const prepared = await prepareAgentContext({
      skills: {
        cwd: workspaceRoot,
        projectRoot: workspaceRoot,
        registerActivationTool: true
      }
    })

    expect(prepared.skillSnapshot?.sources).toEqual([])
    expect(prepared.skillSnapshot?.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.project_untrusted",
        path: join(workspaceRoot, ".agents/skills")
      })
    ])
    await expect(
      prepared.tools?.get(SKILL_ACTIVATION_TOOL_NAME)?.invoke({
        toolCallId: "call_skill",
        toolName: SKILL_ACTIVATION_TOOL_NAME,
        input: { name: "project-skill" },
        ...toolIdentity("call_skill")
      })
    ).resolves.toMatchObject({
      isError: true,
      result: { error: "skill_not_found" }
    })
  })

  it("can return no compiler or an explicit empty replay compiler", async () => {
    const absent = await prepareAgentContext({})
    const present = await prepareAgentContext({ includeEmptyCompiler: true })

    expect(absent.contextCompiler).toBeUndefined()
    await expect(
      present.contextCompiler?.compile({
        sessionId: "ses_empty",
        inputs: [
          {
            id: "inp_empty",
            sessionId: "ses_empty",
            principalId: "principal",
            idempotencyKey: "empty",
            inputType: "user",
            content: [{ type: "text", id: "part_empty", text: "hello" }],
            status: "completed",
            createdAt: 1,
            updatedAt: 1
          }
        ],
        messages: []
      })
    ).resolves.toMatchObject({
      policy: { version: "agent-context-runtime-empty" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", id: "part_empty", text: "hello" }]
        }
      ]
    })
  })

  it("projects a product context profile into prepare options", () => {
    const profile = {
      instructions: {
        cwd: "/repo/app",
        projectRoot: "/repo",
        globalConfigDir: "/home/user/.wanex",
        targets: ["AGENTS.md"],
        trustProject: true
      },
      skills: {
        cwd: "/repo/app",
        projectRoot: "/repo",
        globalSkillDirs: ["/home/user/.wanex/skills"],
        projectSkillDirs: [".agents/skills"],
        trustProject: true,
        registerActivationTool: true,
        activationTool: {
          maxIndexedFiles: 5,
          supportingDirectories: ["references"]
        }
      }
    }
    const options = agentContextProfileToPrepareOptions(profile)
    const json = agentContextProfileToJson(profile)

    expect(options).toMatchObject({
      instructions: {
        cwd: "/repo/app",
        projectRoot: "/repo",
        globalConfigDir: "/home/user/.wanex",
        targets: ["AGENTS.md"],
        trust: { projectInstructions: "trusted" }
      },
      skills: {
        cwd: "/repo/app",
        projectRoot: "/repo",
        globalSkillDirs: ["/home/user/.wanex/skills"],
        projectSkillDirs: [".agents/skills"],
        trust: { projectSkills: "trusted" },
        registerActivationTool: true,
        activationTool: {
          maxIndexedFiles: 5,
          supportingDirectories: ["references"]
        }
      }
    })
    expect(agentContextProfileFromJson(json)).toEqual(profile)
  })

  it("rejects malformed persisted context profiles", () => {
    expect(() =>
      agentContextProfileFromJson({
        instructions: {
          cwd: ""
        }
      })
    ).toThrow("agent context profile.instructions.cwd must be a non-empty string")
    expect(() =>
      agentContextProfileFromJson({
        skills: {
          cwd: "/repo",
          registerActivationTool: "yes"
        }
      })
    ).toThrow(
      "agent context profile.skills.registerActivationTool must be a boolean"
    )
    expect(() =>
      agentContextProfileFromJson({
        skills: {
          cwd: "/repo",
          activationTool: {
            maxIndexedFiles: 0
          }
        }
      })
    ).toThrow(
      "agent context profile.skills.activationTool.maxIndexedFiles must be a positive integer"
    )
  })

  it("keeps project context untrusted by default when using a profile", async () => {
    const workspaceRoot = await mktemp("wanex-agent-context-profile-untrusted-")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Do not load")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/project-skill/SKILL.md"),
      skillMd({
        name: "project-skill",
        description: "Project skill.",
        body: "Do not load"
      })
    )

    const prepared = await prepareAgentContext(
      agentContextProfileToPrepareOptions({
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot
        },
        skills: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          registerActivationTool: true
        }
      })
    )

    expect(prepared.instructionSnapshot?.sources).toEqual([])
    expect(prepared.instructionSnapshot?.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.project_untrusted",
        path: join(workspaceRoot, "AGENTS.md")
      })
    ])
    expect(prepared.skillSnapshot?.sources).toEqual([])
    expect(prepared.skillSnapshot?.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.project_untrusted",
        path: join(workspaceRoot, ".agents/skills")
      })
    ])
  })

  it("validates invalid profile values before discovery", () => {
    expect(() =>
      assertAgentContextProfile({
        instructions: {
          cwd: ""
        }
      })
    ).toThrow("instructions.cwd must be a non-empty string")
    expect(() =>
      assertAgentContextProfile({
        skills: {
          cwd: "/repo",
          activationTool: {
            maxIndexedFiles: 0
          }
        }
      })
    ).toThrow("skills.activationTool.maxIndexedFiles must be a positive integer")
    expect(() =>
      assertAgentContextProfile({
        skills: {
          cwd: "/repo",
          globalSkillDirs: []
        }
      })
    ).toThrow("skills.globalSkillDirs must not be empty")
  })
})

function toolIdentity(toolCallId: string) {
  return {
    principalId: "test",
    sessionId: "session",
    inputId: "input",
    turnId: "turn",
    attemptId: "attempt",
    idempotencyKey: `tool:turn:${toolCallId}`
  }
}

async function mktemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function writeFileRecursive(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, { encoding: "utf8", flush: true })
}

function skillMd(options: {
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
