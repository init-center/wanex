import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { repositoryRelativePath } from "../repository-path.mjs"
import { forbiddenGeneratedDirs, skippedDirs } from "./policy-constants.mjs"

const forbiddenFilePatterns = [
  {
    code: "forbidden-os-metadata-file",
    test: (name) => name === ".DS_Store",
    message: "workspace must not contain OS metadata files"
  },
  {
    code: "forbidden-typescript-build-info",
    test: (name) => name.endsWith(".tsbuildinfo"),
    message: "workspace must not contain TypeScript incremental build info"
  },
  {
    code: "forbidden-runtime-log",
    test: (name) => name.endsWith(".log"),
    message: "workspace must not contain generated log files"
  },
  {
    code: "forbidden-temp-file",
    test: (name) => name.endsWith(".tmp"),
    message: "workspace must not contain generated temp files"
  }
]

export async function findGeneratedArtifactFailures(rootDir) {
  return findGeneratedArtifactFailuresInDir({
    dir: rootDir,
    rootDir
  })
}

async function findGeneratedArtifactFailuresInDir(request) {
  const entries = await readdir(request.dir, { withFileTypes: true })
  const failures = []
  for (const entry of entries) {
    const fullPath = join(request.dir, entry.name)
    const relPath = repositoryRelativePath(request.rootDir, fullPath)
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) {
        continue
      }
      if (forbiddenGeneratedDirs.has(entry.name)) {
        failures.push({
          code: "forbidden-generated-directory",
          path: relPath,
          bytes: await directoryBytes(fullPath),
          message: `workspace must not contain generated directory ${relPath}`
        })
        continue
      }
      failures.push(
        ...(await findGeneratedArtifactFailuresInDir({
          dir: fullPath,
          rootDir: request.rootDir
        }))
      )
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    for (const pattern of forbiddenFilePatterns) {
      if (!pattern.test(entry.name)) {
        continue
      }
      failures.push({
        code: pattern.code,
        path: relPath,
        bytes: (await stat(fullPath)).size,
        message: pattern.message
      })
    }
  }
  return failures
}

async function directoryBytes(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  let total = 0
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await directoryBytes(fullPath)
      continue
    }
    if (entry.isFile()) {
      total += (await stat(fullPath)).size
    }
  }
  return total
}
