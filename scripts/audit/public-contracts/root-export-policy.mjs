const forbiddenRootExportsByPackage = new Map()

const forbiddenRootExportNamesByPackage = new Map()

export function findForbiddenRootExportViolations(packageName, rootSource) {
  return [
    ...forbiddenRootExportSources(packageName, rootSource).map((violation) => ({
      code: "forbidden-root-export-source",
      package: packageName,
      message: `${packageName} root export must not export ${violation.source}: ${violation.reason}`
    })),
    ...forbiddenRootExportNames(packageName, rootSource).map((violation) => ({
      code: "forbidden-root-export-name",
      package: packageName,
      message: `${packageName} root export must not expose ${violation.name}: ${violation.reason}`
    }))
  ]
}

function forbiddenRootExportSources(packageName, rootSource) {
  const rules = forbiddenRootExportsByPackage.get(packageName) ?? []
  return rules.filter((rule) => rootExportsSource(rootSource, rule.source))
}

function forbiddenRootExportNames(packageName, rootSource) {
  const rules = forbiddenRootExportNamesByPackage.get(packageName) ?? []
  return rules.filter((rule) => rootExportsName(rootSource, rule.name))
}

function rootExportsSource(rootSource, source) {
  const escaped = escapeRegExp(source)
  const pattern = new RegExp(
    String.raw`\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']${escaped}["']`
  )
  return pattern.test(rootSource)
}

function rootExportsName(rootSource, name) {
  const escaped = escapeRegExp(name)
  const patterns = [
    new RegExp(String.raw`\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+${escaped}\b`),
    new RegExp(String.raw`\bexport\s+(?:interface|type)\s+${escaped}\b`),
    new RegExp(String.raw`\bexport\s+(?:type\s+)?\{[^}]*\b${escaped}\b[^}]*\}`)
  ]
  return patterns.some((pattern) => pattern.test(rootSource))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
