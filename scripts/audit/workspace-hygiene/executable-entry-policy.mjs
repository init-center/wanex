import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { repositoryRelativePath } from "../repository-path.mjs"
import { forbiddenGeneratedDirs, skippedDirs } from "./policy-constants.mjs"

const sourceExtensionPattern = /\.(?:cjs|js|mjs|ts|tsx)$/
const manualMainModulePattern = /\bprocess\.argv\s*\[\s*1\s*\]/

export async function findExecutableEntryFailures(rootDir) {
  const sourceFiles = []
  for (const sourceRoot of ["apps", "packages", "scripts"]) {
    sourceFiles.push(
      ...(await findSourceFiles(join(rootDir, sourceRoot)))
    )
  }

  const failures = []
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8")
    if (!manualMainModulePattern.test(source)) {
      continue
    }
    failures.push({
      code: "forbidden-manual-main-module-detection",
      path: repositoryRelativePath(rootDir, sourceFile),
      bytes: (await stat(sourceFile)).size,
      message: "Node 26 ESM entries must use import.meta.main instead of comparing an argv entry path with file URLs"
    })
  }
  return failures
}

async function findSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (skippedDirs.has(entry.name)) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (forbiddenGeneratedDirs.has(entry.name)) {
        continue
      }
      paths.push(...(await findSourceFiles(fullPath)))
      continue
    }
    if (entry.isFile() && sourceExtensionPattern.test(entry.name)) {
      paths.push(fullPath)
    }
  }
  return paths
}
