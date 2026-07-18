export function exportedFiles(manifest) {
  const files = []
  collectExportFiles(manifest.exports, files)
  return [...new Set(files)]
}

export function binFiles(manifest) {
  if (typeof manifest.bin === "string") {
    return [stripRelativePrefix(manifest.bin)]
  }
  if (manifest.bin !== null && typeof manifest.bin === "object" && !Array.isArray(manifest.bin)) {
    return [...new Set(Object.values(manifest.bin).filter((value) => typeof value === "string").map(stripRelativePrefix))]
  }
  return []
}

export function entryTargetFiles(manifest) {
  return [...new Set([
    ...exportedFiles(manifest),
    ...binFiles(manifest)
  ])].sort()
}

export function findSourceFirstManifestEntryFailures(request) {
  const failures = []
  const availableFiles = new Set(request.allFiles.map((file) => file.path))
  const manifestBytes =
    request.allFiles.find((file) => file.path === "package.json")?.bytes ?? 0

  if (exportTargetEntries(request.manifest.exports).length === 0) {
    failures.push({
      code: "missing-package-export",
      package: request.manifest.name,
      path: "package.json",
      bytes: manifestBytes,
      message: "workspace packages must define source-first package exports"
    })
  }

  for (const entry of exportTargetEntries(request.manifest.exports)) {
    failures.push(
      ...sourceEntryTargetFailures({
        manifest: request.manifest,
        availableFiles,
        manifestBytes,
        entryKind: "exports",
        entryPath: entry.path,
        target: entry.target
      })
    )
  }

  for (const entry of binTargetEntries(request.manifest.bin)) {
    failures.push(
      ...sourceEntryTargetFailures({
        manifest: request.manifest,
        availableFiles,
        manifestBytes,
        entryKind: "bin",
        entryPath: entry.path,
        target: entry.target
      })
    )
  }

  for (const field of ["main", "types", "typings"]) {
    if (!Object.hasOwn(request.manifest, field)) {
      continue
    }
    failures.push({
      code: "forbidden-source-first-manifest-field",
      package: request.manifest.name,
      path: "package.json",
      bytes: manifestBytes,
      field,
      message: `workspace packages must not define package.json ${field} until an explicit compiled artifact pipeline exists`
    })
  }

  return failures
}

function collectExportFiles(value, files) {
  if (typeof value === "string") {
    files.push(stripRelativePrefix(value))
    return
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return
  }
  for (const nested of Object.values(value)) {
    collectExportFiles(nested, files)
  }
}

function stripRelativePrefix(path) {
  return path.replace(/^\.\//, "")
}

function sourceEntryTargetFailures(request) {
  const failures = []
  const normalizedTarget = stripRelativePrefix(request.target)

  if (!request.target.startsWith("./src/")) {
    failures.push({
      code: "non-source-first-package-entry",
      package: request.manifest.name,
      path: "package.json",
      bytes: request.manifestBytes,
      entryKind: request.entryKind,
      entryPath: request.entryPath,
      target: request.target,
      message: `${request.entryKind} target must point under ./src while package exports are source-first`
    })
  }

  if (!request.target.endsWith(".ts")) {
    failures.push({
      code: "non-typescript-source-package-entry",
      package: request.manifest.name,
      path: "package.json",
      bytes: request.manifestBytes,
      entryKind: request.entryKind,
      entryPath: request.entryPath,
      target: request.target,
      message: `${request.entryKind} target must point at a TypeScript source file while package exports are source-first`
    })
  }

  if (!request.availableFiles.has(normalizedTarget)) {
    failures.push({
      code: "package-entry-target-missing",
      package: request.manifest.name,
      path: "package.json",
      bytes: request.manifestBytes,
      entryKind: request.entryKind,
      entryPath: request.entryPath,
      target: request.target,
      message: `${request.entryKind} target must resolve to a package-owned file`
    })
  }

  return failures
}

function exportTargetEntries(exportsValue) {
  const entries = []
  collectTargetEntries(exportsValue, "exports", entries)
  return entries
}

function binTargetEntries(binValue) {
  if (typeof binValue === "string") {
    return [
      {
        path: "bin",
        target: binValue
      }
    ]
  }
  if (binValue === null || typeof binValue !== "object" || Array.isArray(binValue)) {
    return []
  }
  return Object.entries(binValue)
    .filter((entry) => typeof entry[1] === "string")
    .map(([name, target]) => ({
      path: `bin.${name}`,
      target
    }))
}

function collectTargetEntries(value, path, entries) {
  if (typeof value === "string") {
    entries.push({
      path,
      target: value
    })
    return
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    collectTargetEntries(nested, `${path}.${key}`, entries)
  }
}
