import { readdir, readFile } from "node:fs/promises"
import { dirname, join, normalize, relative, resolve } from "node:path"

export async function findProtocolExportGraphViolations(options) {
  const sourceFiles = await findSourceFiles(options.protocolSourceDir)
  const sourceFileSet = new Set(sourceFiles.map((file) => normalize(file)))
  const indexPath = normalize(join(options.protocolSourceDir, "index.ts"))
  const reachable = new Set()
  const missingTargets = []

  await visitProtocolExportModule({
    filePath: indexPath,
    sourceFileSet,
    reachable,
    missingTargets
  })

  return [
    ...missingTargets.map((target) => ({
      code: "missing-protocol-export-target",
      package: "@wanex/protocol",
      path: relative(options.rootDir, target.from),
      message: `protocol export ${target.specifier} in ${relative(options.rootDir, target.from)} does not resolve to a source module`
    })),
    ...sourceFiles
      .filter((sourceFile) => normalize(sourceFile) !== indexPath)
      .filter((sourceFile) => !reachable.has(normalize(sourceFile)))
      .map((sourceFile) => ({
        code: "unreachable-protocol-source-module",
        package: "@wanex/protocol",
        path: relative(options.rootDir, sourceFile),
        message: `protocol source module ${relative(options.rootDir, sourceFile)} must be reachable from packages/protocol/src/index.ts`
      }))
  ]
}

async function visitProtocolExportModule(options) {
  const normalizedPath = normalize(options.filePath)
  if (options.reachable.has(normalizedPath)) {
    return
  }
  options.reachable.add(normalizedPath)
  const source = await readFile(normalizedPath, "utf8")
  for (const specifier of exportedRelativeSpecifiers(source)) {
    const targetPath = protocolSpecifierToSourcePath(normalizedPath, specifier)
    if (targetPath === null) {
      continue
    }
    if (!options.sourceFileSet.has(targetPath)) {
      options.missingTargets.push({
        from: normalizedPath,
        specifier
      })
      continue
    }
    await visitProtocolExportModule({
      ...options,
      filePath: targetPath
    })
  }
}

async function findSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "target"
    ) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await findSourceFiles(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      paths.push(normalize(fullPath))
    }
  }
  return paths.sort()
}

function exportedRelativeSpecifiers(source) {
  const specifiers = []
  const pattern = /\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1]
    if (typeof specifier === "string" && specifier.startsWith(".")) {
      specifiers.push(specifier)
    }
  }
  return specifiers
}

function protocolSpecifierToSourcePath(fromPath, specifier) {
  if (!specifier.endsWith(".js")) {
    return null
  }
  const tsSpecifier = `${specifier.slice(0, -".js".length)}.ts`
  return normalize(resolve(dirname(fromPath), tsSpecifier))
}
