import { binFiles, exportedFiles } from "./source-first-manifest-entries.mjs"

export function buildEffectivePackagePacklist(request) {
  const filesField = Array.isArray(request.manifest.files)
    ? request.manifest.files
    : null
  if (filesField !== null) {
    return request.allFiles.filter((file) =>
      filesField.some((entry) => matchesFilesEntry(file.path, entry))
    )
  }

  const requiredFiles = new Set([
    "package.json",
    ...exportedFiles(request.manifest),
    ...binFiles(request.manifest)
  ])
  return request.allFiles.filter((file) =>
    file.path === "package.json" ||
    file.path === "README.md" ||
    file.path.startsWith("src/") ||
    requiredFiles.has(file.path)
  )
}

function matchesFilesEntry(path, entry) {
  if (typeof entry !== "string" || entry.length === 0) {
    return false
  }
  const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "")
  return path === normalized || path.startsWith(`${normalized}/`)
}
