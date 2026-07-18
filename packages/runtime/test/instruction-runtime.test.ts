import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler
} from "../src/context/memory/index.js"
import type {
  InstructionFileStat,
  InstructionFileSystem
} from "../src/context/instruction/index.js"
import {
  discoverInstructionSnapshot,
  InstructionContextCompiler,
  instructionSnapshotToSystemPart,
  renderInstructionSnapshot
} from "../src/context/instruction/index.js"

describe("@wanex/runtime/context instruction", () => {
  it("discovers global and trusted project AGENTS.md in deterministic order", async () => {
    const fs = memoryFs({
      "/home/user/.wanex/AGENTS.md": "Global rule",
      "/repo/AGENTS.md": "Repo rule",
      "/repo/packages/pkg/AGENTS.md": "Package rule"
    })

    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo/packages/pkg",
      projectRoot: "/repo",
      globalConfigDir: "/home/user/.wanex",
      trust: { projectInstructions: "trusted" },
      fs
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.diagnostics).toEqual([])
    expect(snapshot.sources.map((source) => [source.scope, source.path])).toEqual([
      ["global", "/home/user/.wanex/AGENTS.md"],
      ["project", "/repo/AGENTS.md"],
      ["project", "/repo/packages/pkg/AGENTS.md"]
    ])
    expect(snapshot.sources.map((source) => source.order)).toEqual([0, 1, 2])
    expect(renderInstructionSnapshot({ snapshot })).toContain("Global rule")
    expect(renderInstructionSnapshot({ snapshot })).toContain("Package rule")
  })

  it("projects per-source provenance into provider replay metadata", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo/packages/pkg",
      projectRoot: "/repo",
      globalConfigDir: "/home/user/.wanex",
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        "/home/user/.wanex/AGENTS.md": "Global rule",
        "/repo/AGENTS.md": "Repo rule",
        "/repo/packages/pkg/AGENTS.md": "Package rule"
      })
    })

    const part = instructionSnapshotToSystemPart(snapshot)

    expect(part).toMatchObject({
      type: "text",
      visibility: "provider_replay_only",
      providerMetadata: {
        wanexInstructionContext: true,
        sourceCount: 3,
        sources: [
          expect.objectContaining({
            id: expect.stringMatching(/^global:/u),
            scope: "global",
            path: "/home/user/.wanex/AGENTS.md",
            target: "AGENTS.md",
            order: 0,
            byteLength: Buffer.byteLength("Global rule"),
            hash: snapshot.sources[0]?.hash,
            mtimeMs: 1
          }),
          expect.objectContaining({
            id: expect.stringMatching(/^project:/u),
            scope: "project",
            path: "/repo/AGENTS.md",
            order: 1,
            hash: snapshot.sources[1]?.hash
          }),
          expect.objectContaining({
            id: expect.stringMatching(/^project:/u),
            scope: "project",
            path: "/repo/packages/pkg/AGENTS.md",
            order: 2,
            hash: snapshot.sources[2]?.hash
          })
        ]
      }
    })
  })

  it("keeps project instructions out of context until the workspace is trusted", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo/app",
      projectRoot: "/repo",
      globalConfigDir: "/home/user/.wanex",
      fs: memoryFs({
        "/home/user/.wanex/AGENTS.md": "Global rule",
        "/repo/AGENTS.md": "Do project thing",
        "/repo/app/AGENTS.md": "Do app thing"
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.sources.map((source) => source.path)).toEqual([
      "/home/user/.wanex/AGENTS.md"
    ])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.project_untrusted",
        severity: "warning",
        path: "/repo/AGENTS.md"
      }),
      expect.objectContaining({
        code: "instruction.project_untrusted",
        severity: "warning",
        path: "/repo/app/AGENTS.md"
      })
    ])
  })

  it("returns unavailable when a discovered instruction disappears before read", async () => {
    const fs = memoryFs({
      "/repo/AGENTS.md": "present"
    })
    fs.readFile = async () => undefined

    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectInstructions: "trusted" },
      fs
    })

    expect(snapshot.status).toBe("unavailable")
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.source_missing",
        severity: "warning",
        path: "/repo/AGENTS.md"
      })
    ])
  })

  it("rejects unsafe targets and cwd outside projectRoot", async () => {
    await expect(
      discoverInstructionSnapshot({
        cwd: "/repo",
        targets: ["../AGENTS.md"],
        fs: memoryFs({})
      })
    ).resolves.toMatchObject({
      status: "unavailable",
      diagnostics: [
        expect.objectContaining({ code: "instruction.invalid_options" })
      ]
    })

    await expect(
      discoverInstructionSnapshot({
        cwd: "/other",
        projectRoot: "/repo",
        fs: memoryFs({})
      })
    ).resolves.toMatchObject({
      status: "unavailable",
      diagnostics: [
        expect.objectContaining({ code: "instruction.invalid_options" })
      ]
    })
  })

  it("prepends instruction context before delegating to a downstream compiler", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        "/repo/AGENTS.md": "Always prefer tests."
      })
    })
    const downstream = new RecordingCompiler()
    const compiler = new InstructionContextCompiler({
      snapshot,
      downstream
    })

    const compiled = await compiler.compile({
      sessionId: "ses_instruction",
      inputs: [
        {
          id: "inp_user",
          sessionId: "ses_instruction",
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
      principalId: "wanex-instruction-runtime"
    })
    expect(downstream.lastInput?.inputs[0]?.content[0]).toMatchObject({
      type: "text",
      visibility: "provider_replay_only",
      text: expect.stringContaining("Always prefer tests.")
    })
    expect(compiled.messages[0]).toMatchObject({
      role: "system",
      content: [
        expect.objectContaining({
          text: expect.stringContaining("Always prefer tests.")
        })
      ]
    })
  })

  it("can compile instruction-only replay without a downstream compiler", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: "/repo",
      projectRoot: "/repo",
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        "/repo/AGENTS.md": "One rule"
      })
    })
    const compiler = new InstructionContextCompiler({ snapshot })

    const compiled = await compiler.compile({
      sessionId: "ses_no_downstream",
      inputs: [],
      messages: []
    })

    expect(compiled.messages).toEqual([
      {
        role: "system",
        content: [
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining("One rule")
          })
        ]
      }
    ])
  })
})

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

function memoryFs(files: Record<string, string>): InstructionFileSystem {
  const normalized = new Map(
    Object.entries(files).map(([path, content]) => [join(path), content])
  )
  return {
    async readFile(path) {
      return normalized.get(join(path))
    },
    async stat(path): Promise<InstructionFileStat | undefined> {
      if (!normalized.has(join(path))) {
        return undefined
      }
      return {
        isFile: true,
        mtimeMs: 1
      }
    }
  }
}
