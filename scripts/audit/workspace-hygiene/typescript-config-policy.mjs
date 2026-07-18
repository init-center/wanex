import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { forbiddenGeneratedDirs, skippedDirs } from "./policy-constants.mjs"

const forbiddenTypeScriptEmitOptions = new Set([
  "outDir",
  "declaration",
  "declarationMap",
  "emitDeclarationOnly",
  "incremental",
  "sourceMap",
  "tsBuildInfoFile"
])

export async function findTypeScriptConfigFailures(rootDir) {
  const tsconfigPaths = await findTypeScriptConfigPaths({
    dir: rootDir,
    rootDir
  })
  const failures = []
  for (const tsconfigPath of tsconfigPaths) {
    const relPath = relative(rootDir, tsconfigPath)
    const raw = await readFile(tsconfigPath, "utf8")
    const config = JSON.parse(raw)
    const bytes = (await stat(tsconfigPath)).size
    const compilerOptions = isRecord(config.compilerOptions)
      ? config.compilerOptions
      : {}

    if (
      tsconfigPath === join(rootDir, "tsconfig.base.json") &&
      compilerOptions.noEmit !== true
    ) {
      failures.push({
        code: "required-typescript-base-no-emit",
        path: relPath,
        bytes,
        option: "noEmit",
        message: "root tsconfig.base.json must set compilerOptions.noEmit to true while package exports are source-first"
      })
    }

    for (const option of forbiddenTypeScriptEmitOptions) {
      if (!Object.hasOwn(compilerOptions, option)) {
        continue
      }
      failures.push({
        code: "forbidden-typescript-emit-option",
        path: relPath,
        bytes,
        option,
        message: `workspace TypeScript configs must not define compilerOptions.${option} while package exports are source-first`
      })
    }
  }
  return failures
}

async function findTypeScriptConfigPaths(request) {
  const entries = await readdir(request.dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (skippedDirs.has(entry.name)) {
      continue
    }
    const fullPath = join(request.dir, entry.name)
    if (entry.isDirectory()) {
      if (forbiddenGeneratedDirs.has(entry.name)) {
        continue
      }
      paths.push(
        ...(await findTypeScriptConfigPaths({
          dir: fullPath,
          rootDir: request.rootDir
        }))
      )
      continue
    }
    if (entry.isFile() && /^tsconfig(?:\..+)?\.json$/.test(entry.name)) {
      paths.push(fullPath)
    }
  }
  return paths
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
