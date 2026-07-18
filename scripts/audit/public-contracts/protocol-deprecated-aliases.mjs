import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

export async function findProtocolDeprecatedAliasViolations(options) {
  const sourceFiles = await findSourceFiles(options.protocolSourceDir)
  const violations = []
  for (const sourceFile of sourceFiles) {
    const relSourceFile = relative(options.rootDir, sourceFile)
    const source = await readFile(sourceFile, "utf8")
    if (source.includes("@deprecated")) {
      violations.push({
        code: "forbidden-protocol-deprecated-annotation",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must not introduce deprecated public aliases in ${relSourceFile}`
      })
    }
    if (/\bafterEventId\b/.test(source)) {
      violations.push({
        code: "forbidden-protocol-after-event-id-alias",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must use QueryEventsInput.after cursor semantics, not afterEventId in ${relSourceFile}`
      })
    }
    if (/\bexport\s+type\s+Legacy[A-Za-z0-9_]*\b/.test(source)) {
      violations.push({
        code: "forbidden-protocol-legacy-type-alias",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must not export pre-release Legacy* type aliases in ${relSourceFile}`
      })
    }
    const uiSurfaceMessagePartBody = exportedInterfaceBody(source, "UiSurfaceMessagePart")
    if (uiSurfaceMessagePartBody === null) {
      continue
    }
    if (/\breadonly\s+surfaceKind\b/.test(uiSurfaceMessagePartBody)) {
      violations.push({
        code: "forbidden-protocol-ui-surface-root-surface-kind",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `UiSurfaceMessagePart must carry surface.surfaceKind, not a root surfaceKind alias in ${relSourceFile}`
      })
    }
    if (/\breadonly\s+payload\b/.test(uiSurfaceMessagePartBody)) {
      violations.push({
        code: "forbidden-protocol-ui-surface-root-payload",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `UiSurfaceMessagePart must carry surface.payload, not a root payload alias in ${relSourceFile}`
      })
    }
  }
  return violations
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
    if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
      entry.name !== "package.json"
    ) {
      paths.push(fullPath)
    }
  }
  return paths
}

function exportedInterfaceBody(source, name) {
  const marker = new RegExp(String.raw`\bexport\s+interface\s+${escapeRegExp(name)}\b`)
  const match = marker.exec(source)
  if (match === null) {
    return null
  }
  const openBraceIndex = source.indexOf("{", match.index)
  if (openBraceIndex === -1) {
    return null
  }
  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "{") {
      depth += 1
      continue
    }
    if (char !== "}") {
      continue
    }
    depth -= 1
    if (depth === 0) {
      return source.slice(openBraceIndex + 1, index)
    }
  }
  return null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
