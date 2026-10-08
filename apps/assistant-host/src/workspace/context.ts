import { randomUUID } from "node:crypto"
import { relative } from "node:path"
import { discoverInstructionSnapshot, discoverSkillSnapshot, InstructionContextCompiler, SkillContextCompiler, SemanticContextCompiler, type PreparedAgentContext, type InstructionSnapshot, type SkillSnapshot } from "@wanex/runtime/context"
import type { ExecutionEnvironment, ExecutionFileSystem } from "@wanex/runtime/execution"
import type { CoreStore } from "@wanex/storage"
import type { RootContext, RootIdentity, WorkspaceGeneration } from "./model.js"
import { readOnlyPolicy } from "./model.js"

export function discoveryFileSystem(fs: ExecutionFileSystem) {
  return {
    async readFile(path: string) {
      const metadata = await fs.metadata(path)
      if (metadata === null || metadata.kind === "directory") return undefined
      return new TextDecoder("utf-8", { fatal: true }).decode(await fs.read(path))
    },
    async stat(path: string) {
      const value = await fs.metadata(path)
      return value === null ? undefined : {
        isFile: value.kind === "file", isDirectory: value.kind === "directory", mtimeMs: value.modifiedAt
      }
    },
    async readDir(path: string) {
      if (await fs.metadata(path) === null) return undefined
      return (await fs.list(path)).map((entry) => ({
        name: entry.name, isFile: entry.kind === "file", isDirectory: entry.kind === "directory"
      }))
    }
  }
}

export async function withFileSystem<T>(environment: ExecutionEnvironment, roots: readonly RootIdentity[], operation: (fs: ExecutionFileSystem) => Promise<T>): Promise<T> {
  const scope = await environment.bind({
    scopeId: `workspace_${randomUUID()}`, policy: readOnlyPolicy(roots), fileSystemRoots: roots
  })
  try { return await operation(scope.fileSystem) } finally { await scope.close() }
}

export async function discoverRoot(root: RootIdentity, fs: ExecutionFileSystem, cwd = root.path): Promise<RootContext> {
  const boundedFs = discoveryFileSystem(fs)
  const instructions = await discoverInstructionSnapshot({ cwd, projectRoot: root.path, trust: { projectInstructions: "trusted" }, fs: boundedFs })
  const skills = await discoverSkillSnapshot({ cwd, projectRoot: root.path, trust: { projectSkills: "trusted" }, fs: boundedFs })
  if (instructions.status !== "available" || !skills.complete) {
    throw new Error(`workspace context discovery failed: ${root.id}`)
  }
  return { root, instructions, skills }
}

export function selectedSnapshots(roots: readonly RootContext[], rootIds: readonly string[], base?: PreparedAgentContext): { instructions: InstructionSnapshot; skills: SkillSnapshot } {
  const instructions = [...(base?.instructionSnapshot?.sources.filter((source) => source.scope === "global") ?? [])]
  const skills = [...(base?.skillSnapshot?.sources.filter((source) => source.scope === "global") ?? [])]
  for (const entry of roots.filter((entry) => rootIds.includes(entry.root.id))) {
    instructions.push(...entry.instructions.sources.map((source) => ({ ...source, target: `${entry.root.id}:${relative(entry.root.path, source.path)}` })))
    skills.push(...entry.skills.sources.map((source) => ({
      ...source, name: `${entry.root.id}:${source.name}`,
      description: `[rootId=${entry.root.id}, skill=${source.name}] ${source.description}`
    })))
  }
  return {
    instructions: { status: "available", sources: instructions.map((source, order) => ({ ...source, order })), diagnostics: [] },
    skills: { complete: true, sources: skills.map((source, order) => ({ ...source, order })), diagnostics: [] }
  }
}

export function generationCompiler(generation: WorkspaceGeneration, storage: CoreStore, assertAuthority: () => Promise<void>): NonNullable<PreparedAgentContext["contextCompiler"]> {
  const compiler = new SkillContextCompiler({ snapshot: generation.skills, downstream:
    new InstructionContextCompiler({ snapshot: generation.instructions, downstream:
      new SemanticContextCompiler({ epochStore: storage })
    })
  })
  return {
    async compile(input) {
      await assertAuthority()
      const result = await compiler.compile(input)
      await assertAuthority()
      return result
    }
  }
}
