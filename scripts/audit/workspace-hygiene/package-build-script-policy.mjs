import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { repositoryRelativePath } from "../repository-path.mjs"
import { forbiddenGeneratedDirs, skippedDirs } from "./policy-constants.mjs"

export async function findPackageBuildScriptFailures(rootDir) {
  const packageJsonPaths = await findPackageJsons({
    dir: rootDir,
    rootDir
  })
  const failures = []
  for (const packageJsonPath of packageJsonPaths) {
    const relPath = repositoryRelativePath(rootDir, packageJsonPath)
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
    const buildScript = manifest.scripts?.build
    if (packageJsonPath === join(rootDir, "package.json")) {
      if (
        typeof buildScript === "string" &&
        buildScript.includes("pnpm -r") &&
        buildScript.includes("build")
      ) {
        failures.push({
          code: "forbidden-recursive-package-build",
          path: relPath,
          bytes: (await stat(packageJsonPath)).size,
          message: "root build must not recursively invoke package-local emitting builds"
        })
      }
      continue
    }
    if (
      typeof manifest.name === "string" &&
      manifest.name.startsWith("@wanex/") &&
      typeof buildScript === "string" &&
      /\btsc\b/.test(buildScript) &&
      !buildScript.includes("--noEmit")
    ) {
      failures.push({
        code: "forbidden-emitting-tsc-build-script",
        path: relPath,
        bytes: (await stat(packageJsonPath)).size,
        message: "workspace packages must not define emitting tsc build scripts while package exports are source-first"
      })
    }
  }
  return failures
}

async function findPackageJsons(request) {
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
        ...(await findPackageJsons({
          dir: fullPath,
          rootDir: request.rootDir
        }))
      )
      continue
    }
    if (entry.isFile() && entry.name === "package.json") {
      paths.push(fullPath)
    }
  }
  return paths
}
