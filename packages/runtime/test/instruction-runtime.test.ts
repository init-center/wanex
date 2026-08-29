import { join, resolve } from "node:path"
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

const fixtureRoot = resolve("instruction-runtime-fixture")
const projectRoot = join(fixtureRoot, "repo")
const packageDir = join(projectRoot, "packages", "pkg")
const appDir = join(projectRoot, "app")
const otherRoot = join(fixtureRoot, "other")
const globalConfigDir = join(fixtureRoot, "home", "user", ".wanex")
const globalInstructions = join(globalConfigDir, "AGENTS.md")
const repoInstructions = join(projectRoot, "AGENTS.md")
const packageInstructions = join(packageDir, "AGENTS.md")
const appInstructions = join(appDir, "AGENTS.md")

describe("@wanex/runtime/context instruction", () => {
  it("discovers global and trusted project AGENTS.md in deterministic order", async () => {
    const fs = memoryFs({
      [globalInstructions]: "Global rule",
      [repoInstructions]: "Repo rule",
      [packageInstructions]: "Package rule"
    })

    const snapshot = await discoverInstructionSnapshot({
      cwd: packageDir,
      projectRoot,
      globalConfigDir,
      trust: { projectInstructions: "trusted" },
      fs
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.diagnostics).toEqual([])
    expect(snapshot.sources.map((source) => [source.scope, source.path])).toEqual([
      ["global", globalInstructions],
      ["project", repoInstructions],
      ["project", packageInstructions]
    ])
    expect(snapshot.sources.map((source) => source.order)).toEqual([0, 1, 2])
    expect(renderInstructionSnapshot({ snapshot })).toContain("Global rule")
    expect(renderInstructionSnapshot({ snapshot })).toContain("Package rule")
  })

  it("projects per-source provenance into provider replay metadata", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: packageDir,
      projectRoot,
      globalConfigDir,
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        [globalInstructions]: "Global rule",
        [repoInstructions]: "Repo rule",
        [packageInstructions]: "Package rule"
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
            scope: "global",
            target: "AGENTS.md",
            order: 0,
            byteLength: Buffer.byteLength("Global rule"),
            hash: snapshot.sources[0]?.hash
          }),
          expect.objectContaining({
            scope: "project",
            order: 1,
            hash: snapshot.sources[1]?.hash
          }),
          expect.objectContaining({
            scope: "project",
            order: 2,
            hash: snapshot.sources[2]?.hash
          })
        ]
      }
    })
    expect(JSON.stringify(part?.providerMetadata)).not.toContain(fixtureRoot)
  })

  it("keeps project instructions out of context until the workspace is trusted", async () => {
    const snapshot = await discoverInstructionSnapshot({
      cwd: appDir,
      projectRoot,
      globalConfigDir,
      fs: memoryFs({
        [globalInstructions]: "Global rule",
        [repoInstructions]: "Do project thing",
        [appInstructions]: "Do app thing"
      })
    })

    expect(snapshot.status).toBe("available")
    expect(snapshot.sources.map((source) => source.path)).toEqual([
      globalInstructions
    ])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.project_untrusted",
        severity: "warning",
        path: repoInstructions
      }),
      expect.objectContaining({
        code: "instruction.project_untrusted",
        severity: "warning",
        path: appInstructions
      })
    ])
  })

  it("returns unavailable when a discovered instruction disappears before read", async () => {
    const fs = memoryFs({
      [repoInstructions]: "present"
    })
    fs.readFile = async () => undefined

    const snapshot = await discoverInstructionSnapshot({
      cwd: projectRoot,
      projectRoot,
      trust: { projectInstructions: "trusted" },
      fs
    })

    expect(snapshot.status).toBe("unavailable")
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.source_missing",
        severity: "warning",
        path: repoInstructions
      })
    ])
  })

  it("rejects unsafe targets and cwd outside projectRoot", async () => {
    await expect(
      discoverInstructionSnapshot({
        cwd: projectRoot,
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
        cwd: otherRoot,
        projectRoot,
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
      cwd: projectRoot,
      projectRoot,
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        [repoInstructions]: "Always prefer tests."
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
      cwd: projectRoot,
      projectRoot,
      trust: { projectInstructions: "trusted" },
      fs: memoryFs({
        [repoInstructions]: "One rule"
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
      messages: input.inputs.map((record) => ({
        role: record.inputType === "system" ? "system" : "user",
        content: record.content
      })),
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0
      }
    }
  }
}

function memoryFs(files: Record<string, string>): InstructionFileSystem {
  const normalized = new Map(
    Object.entries(files).map(([path, content]) => [resolve(path), content])
  )
  return {
    async readFile(path) {
      return normalized.get(resolve(path))
    },
    async stat(path): Promise<InstructionFileStat | undefined> {
      if (!normalized.has(resolve(path))) {
        return undefined
      }
      return {
        isFile: true,
        mtimeMs: 1
      }
    }
  }
}
