import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

export async function findProtocolSourcePolicyViolations(options) {
  const sourceFiles = await findSourceFiles(options.protocolSourceDir)
  const violations = []
  for (const sourceFile of sourceFiles) {
    const relSourceFile = relative(options.rootDir, sourceFile)
    const source = await readFile(sourceFile, "utf8")
    if (source.includes("@deprecated")) {
      violations.push({
        code: "forbidden-protocol-deprecated-contract",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must replace unpublished contracts directly, not deprecate them in ${relSourceFile}`
      })
    }
    if (/\bafterEventId\b/.test(source)) {
      violations.push({
        code: "forbidden-protocol-event-id-cursor",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol event queries must use the stable QueryEventsInput.after cursor in ${relSourceFile}`
      })
    }
    if (/\bexport\s+type\s+Legacy[A-Za-z0-9_]*\b/.test(source)) {
      violations.push({
        code: "forbidden-protocol-legacy-export",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must replace unpublished types directly, not export Legacy-prefixed types in ${relSourceFile}`
      })
    }
    if (/\bUiSurface(?:MessagePart|Envelope)?\b/.test(source)) {
      violations.push({
        code: "forbidden-protocol-ui-contract",
        package: "@wanex/protocol",
        path: relSourceFile,
        message: `protocol source must not define Product-owned UI rendering contracts in ${relSourceFile}`
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
