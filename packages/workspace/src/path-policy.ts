import { lstat, realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

export class WorkspacePathResolver {
  readonly rootDir: string

  private readonly canonicalRoot: Promise<string>

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir)
    this.canonicalRoot = realpath(this.rootDir)
  }

  async resolveRead(path: string): Promise<string> {
    const candidate = this.candidate(path)
    await this.assertCanonicalContainment(candidate, path)
    return candidate
  }

  async resolveMutation(path: string): Promise<string> {
    const candidate = this.candidate(path)
    await this.assertCanonicalContainment(candidate, path)
    try {
      if ((await lstat(candidate)).isSymbolicLink()) {
        throw workspacePathEscape(path)
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error
      }
    }
    return candidate
  }

  async resolveDirectory(path?: string): Promise<string> {
    if (path === undefined || path === ".") {
      return await this.canonicalRoot
    }
    const candidate = await this.resolveRead(path)
    if (!(await stat(candidate)).isDirectory()) {
      throw new Error(`workspace path is not a directory: ${path}`)
    }
    return candidate
  }

  private candidate(path: string): string {
    const normalized = normalizeWorkspaceRelativePath(path)
    return resolve(this.rootDir, ...normalized.split("/"))
  }

  private async assertCanonicalContainment(
    candidate: string,
    inputPath: string
  ): Promise<void> {
    const root = await this.canonicalRoot
    let current = candidate

    while (true) {
      try {
        const canonical = await realpath(current)
        const contained =
          current === candidate
            ? isStrictDescendant(root, canonical)
            : isContainedOrRoot(root, canonical)
        if (!contained) {
          throw workspacePathEscape(inputPath)
        }
        return
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error
        }
      }

      const parent = dirname(current)
      if (parent === current) {
        throw workspacePathEscape(inputPath)
      }
      current = parent
    }
  }
}

export function normalizeWorkspaceRelativePath(path: string): string {
  if (path.length === 0 || path.includes("\0")) {
    throw new Error(`invalid workspace path: ${path}`)
  }

  const portable = path.replaceAll("\\", "/")
  if (
    portable.startsWith("/") ||
    portable.startsWith("//") ||
    /^[A-Za-z]:\//u.test(portable) ||
    isAbsolute(path)
  ) {
    throw workspacePathEscape(path)
  }

  const segments = portable.split("/")
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw workspacePathEscape(path)
  }
  return segments.join("/")
}

function isStrictDescendant(root: string, target: string): boolean {
  const rel = relative(root, target)
  return (
    rel.length > 0 &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  )
}

function isContainedOrRoot(root: string, target: string): boolean {
  return target === root || isStrictDescendant(root, target)
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function workspacePathEscape(path: string): Error {
  return new Error(`workspace path escapes root: ${path}`)
}
