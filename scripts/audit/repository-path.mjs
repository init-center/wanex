import { relative } from "node:path"

export function repositoryRelativePath(rootDir, targetPath) {
  return normalizeRepositoryPath(relative(rootDir, targetPath))
}

export function normalizeRepositoryPath(path) {
  return path.replaceAll("\\", "/")
}
