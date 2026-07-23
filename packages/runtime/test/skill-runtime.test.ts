import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler
} from "../src/context/memory/index.js"
import type {
  SkillDirEntry,
  SkillFileStat,
  SkillFileSystem
} from "../src/context/skill/index.js"
import {
  activateSkill,
  discoverSkillSnapshot,
  renderSkillSnapshot,
  SkillActivationTool,
  SkillContextCompiler,
  skillSnapshotToSystemPart
} from "../src/context/skill/index.js"

describe("../src/context/skill/index.js", () => {
  it("discovers global and trusted project skills in deterministic order", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo/packages/app",
      projectRoot: "/repo",
      globalSkillDirs: ["/home/user/.wanex/skills"],
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/home/user/.wanex/skills/review-pr/SKILL.md": skillMd({
          name: "review-pr",
          description: "Review pull requests.",
          body: "Global review body"
        }),
        "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
          name: "write-tests",
          description: "Write focused tests.",
          body: "Repo test body"
        }),
        "/repo/packages/app/.wanex/skills/refactor-module/SKILL.md": skillMd({
          name: "refactor-module",
          description: "Refactor one module safely.",
          body: "App refactor body"
        })
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.diagnostics).toEqual([])
    expect(snapshot.sources.map((source) => [source.scope, source.name])).toEqual([
      ["global", "review-pr"],
      ["project", "write-tests"],
      ["project", "refactor-module"]
    ])
    expect(snapshot.sources.map((source) => source.order)).toEqual([0, 1, 2])
  })

  it("keeps project skills out of context until the workspace is trusted", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo/app",
      projectRoot: "/repo",
      globalSkillDirs: ["/home/user/.wanex/skills"],
      fs: memoryFs({
        "/home/user/.wanex/skills/global-skill/SKILL.md": skillMd({
          name: "global-skill",
          description: "Use globally.",
          body: "Global body"
        }),
        "/repo/.agents/skills/project-skill/SKILL.md": skillMd({
          name: "project-skill",
          description: "Use in project.",
          body: "Project body"
        }),
        "/repo/app/.wanex/skills/app-skill/SKILL.md": skillMd({
          name: "app-skill",
          description: "Use in app.",
          body: "App body"
        })
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.sources.map((source) => source.name)).toEqual(["global-skill"])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.project_untrusted",
        severity: "warning",
        path: "/repo/.agents/skills"
      }),
      expect.objectContaining({
        code: "skill.project_untrusted",
        severity: "warning",
        path: "/repo/app/.wanex/skills"
      })
    ])
  })

  it("reports invalid skill metadata without failing the whole snapshot", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/repo/.agents/skills/good-skill/SKILL.md": skillMd({
          name: "good-skill",
          description: "Good skill.",
          body: "Good body"
        }),
        "/repo/.agents/skills/BadName/SKILL.md": skillMd({
          name: "BadName",
          description: "Bad skill.",
          body: "Bad body"
        })
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.sources.map((source) => source.name)).toEqual(["good-skill"])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.invalid_frontmatter",
        severity: "warning",
        path: "/repo/.agents/skills/BadName/SKILL.md"
      })
    ])
  })

  it("rejects directory/name mismatches and overlong descriptions", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/repo/.agents/skills/actual-name/SKILL.md": skillMd({
          name: "declared-name",
          description: "Mismatch.",
          body: "Mismatch body"
        }),
        "/repo/.agents/skills/too-long/SKILL.md": skillMd({
          name: "too-long",
          description: "x".repeat(1025),
          body: "Long body"
        })
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.sources).toEqual([])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.invalid_frontmatter",
        path: "/repo/.agents/skills/actual-name/SKILL.md",
        message: expect.stringContaining("directory")
      }),
      expect.objectContaining({
        code: "skill.invalid_frontmatter",
        path: "/repo/.agents/skills/too-long/SKILL.md",
        message: expect.stringContaining("description")
      })
    ])
  })

  it("keeps the first skill when duplicate names are discovered", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      globalSkillDirs: ["/home/user/.wanex/skills"],
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/home/user/.wanex/skills/shared-skill/SKILL.md": skillMd({
          name: "shared-skill",
          description: "Global copy.",
          body: "Global body"
        }),
        "/repo/.agents/skills/shared-skill/SKILL.md": skillMd({
          name: "shared-skill",
          description: "Project copy.",
          body: "Project body"
        })
      })
    })

    expect(snapshot.sources).toHaveLength(1)
    expect(snapshot.sources[0]).toMatchObject({
      scope: "global",
      description: "Global copy."
    })
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.duplicate_name",
        skillName: "shared-skill",
        path: "/repo/.agents/skills/shared-skill/SKILL.md"
      })
    ])
  })

  it("renders only skill catalog metadata and never full skill bodies", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
          name: "write-tests",
          description: "Write tests with <care>.",
          body: "SECRET FULL SKILL BODY"
        })
      })
    })

    const rendered = renderSkillSnapshot({ snapshot })

    expect(rendered).toContain("<available_skills>")
    expect(rendered).toContain("<name>write-tests</name>")
    expect(rendered).toContain("Write tests with &lt;care&gt;.")
    expect(rendered).toContain("<body_hash>")
    expect(rendered).not.toContain("SECRET FULL SKILL BODY")
  })

  it("projects per-source catalog provenance into provider replay metadata", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
          name: "write-tests",
          description: "Write focused tests.",
          body: "SECRET FULL SKILL BODY",
          allowedTools: ["shell", "apply_patch"],
          metadata: { owner: "quality" }
        })
      })
    })

    const part = skillSnapshotToSystemPart(snapshot)

    expect(part?.providerMetadata).toMatchObject({
      wanexSkillCatalog: true,
      sourceCount: 1,
      sources: [
        expect.objectContaining({
          id: expect.stringMatching(/^project:/u),
          scope: "project",
          name: "write-tests",
          directory: "/repo/.agents/skills/write-tests",
          path: "/repo/.agents/skills/write-tests/SKILL.md",
          order: 0,
          byteLength: expect.any(Number),
          hash: snapshot.sources[0]?.hash,
          bodyHash: snapshot.sources[0]?.bodyHash,
          allowedTools: ["shell", "apply_patch"],
          metadata: { owner: "quality" },
          mtimeMs: 1
        })
      ]
    })
    expect(JSON.stringify(part?.providerMetadata)).not.toContain(
      "SECRET FULL SKILL BODY"
    )
  })

  it("prepends skill catalog context before delegating to a downstream compiler", async () => {
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs: memoryFs({
        "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
          name: "write-tests",
          description: "Write focused tests.",
          body: "Skill body"
        })
      })
    })
    const downstream = new RecordingCompiler()
    const compiler = new SkillContextCompiler({ snapshot, downstream })

    const compiled = await compiler.compile({
      sessionId: "ses_skill",
      inputs: [
        {
          id: "inp_user",
          sessionId: "ses_skill",
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

    expect(downstream.lastInput?.inputs).toHaveLength(2)
    expect(downstream.lastInput?.inputs[0]).toMatchObject({
      inputType: "system",
      principalId: "wanex-skill-runtime"
    })
    expect(downstream.lastInput?.inputs[0]?.content[0]).toMatchObject({
      type: "text",
      visibility: "provider_replay_only",
      text: expect.stringContaining("<name>write-tests</name>")
    })
    expect(compiled.messages[0]).toMatchObject({
      role: "system",
      content: [
        expect.objectContaining({
          text: expect.stringContaining("<name>write-tests</name>")
        })
      ]
    })
  })

  it("rejects unsafe project skill directory options", async () => {
    await expect(
      discoverSkillSnapshot({
        cwd: "/repo",
        projectSkillDirs: ["../skills"],
        fs: memoryFs({})
      })
    ).resolves.toMatchObject({
      status: "unavailable",
      diagnostics: [
        expect.objectContaining({ code: "skill.invalid_options" })
      ]
    })
  })

  it("activates one skill lazily with full content and bounded supporting file index", async () => {
    const fs = memoryFs({
      "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Read references/testing.md when changing test policy."
      }),
      "/repo/.agents/skills/write-tests/references/testing.md": "Testing reference",
      "/repo/.agents/skills/write-tests/scripts/run-tests.sh": "#!/bin/sh\nexit 0",
      "/repo/.agents/skills/write-tests/assets/logo.png": "fake"
    })
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs
    })

    const activated = await activateSkill({
      snapshot,
      name: "write-tests",
      fs,
      maxIndexedFiles: 2
    })

    expect(activated).toMatchObject({
      name: "write-tests",
      content: expect.stringContaining("Read references/testing.md")
    })
    expect("error" in activated).toBe(false)
    if ("error" in activated) {
      throw new Error(activated.message)
    }
    expect(activated.provenance).toMatchObject({
      scope: "project",
      hash: snapshot.sources[0]?.hash,
      bodyHash: snapshot.sources[0]?.bodyHash,
      mtimeMs: 1
    })
    expect(activated.supportingFiles.map((file) => file.relativePath)).toEqual([
      "references/testing.md",
      "scripts/run-tests.sh"
    ])
  })

  it("exposes activation as a tool-core ToolDefinition", async () => {
    const fs = memoryFs({
      "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Full skill body"
      })
    })
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs
    })
    const tool = new SkillActivationTool({ snapshot, fs })

    const result = await tool.invoke({
      toolCallId: "call_skill",
      toolName: "activate_skill",
      input: { name: "write-tests" },
      ...toolIdentity("call_skill")
    })

    expect(result.isError).toBe(false)
    expect(result.result).toMatchObject({
      name: "write-tests",
      output: expect.stringContaining("<skill_content name=\"write-tests\">"),
      provenance: {
        scope: "project",
        hash: snapshot.sources[0]?.hash,
        bodyHash: snapshot.sources[0]?.bodyHash,
        mtimeMs: 1
      }
    })
    expect(JSON.stringify(result.result)).toContain("Full skill body")
  })

  it("fails skill activation closed for invalid input and missing skills", async () => {
    const tool = new SkillActivationTool({
      snapshot: {
        status: "available",
        sources: [],
        diagnostics: []
      },
      fs: memoryFs({})
    })

    await expect(
      tool.invoke({
        toolCallId: "call_invalid",
        toolName: "activate_skill",
        input: {},
        ...toolIdentity("call_invalid")
      })
    ).resolves.toMatchObject({
      isError: true,
      result: { error: "invalid_input" }
    })

    await expect(
      tool.invoke({
        toolCallId: "call_missing",
        toolName: "activate_skill",
        input: { name: "missing-skill" },
        ...toolIdentity("call_missing")
      })
    ).resolves.toMatchObject({
      isError: true,
      result: { error: "skill_not_found", skillName: "missing-skill" }
    })
  })

  it("fails activation closed when SKILL.md changes to invalid metadata", async () => {
    const fs = memoryFs({
      "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Original body"
      })
    })
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs
    })
    fs.readFile = async () =>
      skillMd({
        name: "wrong-name",
        description: "Wrong now.",
        body: "Wrong body"
      })

    await expect(
      activateSkill({
        snapshot,
        name: "write-tests",
        fs
      })
    ).resolves.toMatchObject({
      error: "skill_source_invalid",
      skillName: "write-tests"
    })
  })

  it("fails activation closed when SKILL.md changes to a valid same-name source", async () => {
    const fs = memoryFs({
      "/repo/.agents/skills/write-tests/SKILL.md": skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Original body"
      })
    })
    const snapshot = await discoverSkillSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectSkills: "trusted" },
      fs
    })
    fs.readFile = async () =>
      skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "Changed body"
      })

    await expect(
      activateSkill({
        snapshot,
        name: "write-tests",
        fs
      })
    ).resolves.toMatchObject({
      error: "skill_source_changed",
      skillName: "write-tests"
    })
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

class RecordingCompiler implements ContextCompiler {
  lastInput: CompileContextInput | undefined

  async compile(input: CompileContextInput): Promise<CompiledContext> {
    this.lastInput = input
    return {
      sessionId: input.sessionId,
      ...(input.epochId === undefined ? {} : { epochId: input.epochId }),
      policy: {
        version: "recording",
        maxInputTokens: 0,
        recentUserTurns: 0,
        snipTextOverChars: 0,
        placeholderTextOverChars: 0,
        snipHeadChars: 0,
        snipTailChars: 0
      },
      messages: input.inputs.map((record) => ({
        role: record.inputType === "system" ? "system" : "user",
        content: record.content
      })),
      replacements: [],
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0,
        replacementCount: 0
      }
    }
  }
}

function skillMd(options: {
  readonly name: string
  readonly description: string
  readonly body: string
  readonly allowedTools?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
}): string {
  return [
    "---",
    `name: ${JSON.stringify(options.name)}`,
    `description: ${JSON.stringify(options.description)}`,
    ...(options.allowedTools === undefined
      ? []
      : [`allowed-tools: ${JSON.stringify(options.allowedTools)}`]),
    ...(options.metadata === undefined
      ? []
      : [
          "metadata:",
          ...Object.entries(options.metadata).map(
            ([key, value]) => `  ${key}: ${JSON.stringify(value)}`
          )
        ]),
    "---",
    "",
    options.body
  ].join("\n")
}

function memoryFs(files: Readonly<Record<string, string>>): SkillFileSystem {
  const normalized = new Map(
    Object.entries(files).map(([path, content]) => [normalize(path), content])
  )
  return {
    async readFile(path) {
      return normalized.get(normalize(path))
    },
    async readDir(path) {
      const base = normalize(path)
      const prefix = base.endsWith("/") ? base : `${base}/`
      const entries = new Map<string, SkillDirEntry>()
      for (const filePath of normalized.keys()) {
        if (!filePath.startsWith(prefix)) {
          continue
        }
        const rest = filePath.slice(prefix.length)
        const [first, ...remaining] = rest.split("/")
        if (first === undefined || first.length === 0) {
          continue
        }
        entries.set(first, {
          name: first,
          isDirectory: remaining.length > 0,
          isFile: remaining.length === 0
        })
      }
      return [...entries.values()]
    },
    async stat(path) {
      const normalizedPath = normalize(path)
      const direct = normalized.has(normalizedPath)
      const prefix = normalizedPath.endsWith("/")
        ? normalizedPath
        : `${normalizedPath}/`
      const directory = [...normalized.keys()].some((filePath) =>
        filePath.startsWith(prefix)
      )
      if (!direct && !directory) {
        return undefined
      }
      return {
        isFile: direct,
        isDirectory: directory,
        mtimeMs: 1
      } satisfies SkillFileStat
    }
  }
}

function normalize(path: string): string {
  return resolve(path)
}
