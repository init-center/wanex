import { join, relative } from "node:path"
import type {
  SkillFileSystem,
  SkillSource,
  SkillSupportingFile
} from "./types.js"

export async function listSkillSupportingFiles(options: {
  readonly fs: SkillFileSystem
  readonly source: SkillSource
  readonly supportingDirectories: readonly string[]
  readonly maxIndexedFiles: number
}): Promise<readonly SkillSupportingFile[]> {
  if (options.maxIndexedFiles <= 0) {
    return []
  }
  const files: SkillSupportingFile[] = []
  for (const directoryName of options.supportingDirectories) {
    const directory = join(options.source.directory, directoryName)
    const entries = await safeReadDir(options.fs, directory)
    for (const entry of entries) {
      if (!entry.isFile || entry.name.startsWith(".")) {
        continue
      }
      const path = join(directory, entry.name)
      files.push({
        path,
        relativePath: relative(options.source.directory, path)
      })
      if (files.length >= options.maxIndexedFiles) {
        return files
      }
    }
  }
  return files
}

async function safeReadDir(
  fs: SkillFileSystem,
  path: string
): Promise<Awaited<ReturnType<SkillFileSystem["readDir"]>> & {}> {
  try {
    return (await fs.readDir(path)) ?? []
  } catch {
    return []
  }
}
