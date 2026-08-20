import { mkdir, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import type {
  LocatedRepository,
  LocalRepositoryLocatorOptions,
  RepositoryLocator
} from "./types.js"

const DEFAULT_GIT_TIMEOUT_MS = 10_000

export class LocalRepositoryLocator implements RepositoryLocator {
  private readonly entries: ReadonlyMap<string, LocalRepositoryLocatorOptions["repositories"][number]>

  constructor(options: LocalRepositoryLocatorOptions) {
    const entries = new Map<string, LocalRepositoryLocatorOptions["repositories"][number]>()
    for (const entry of options.repositories) {
      requireOpaqueRepositoryId(entry.repositoryId)
      if (entries.has(entry.repositoryId)) {
        throw new Error(`repository locator id is duplicated: ${entry.repositoryId}`)
      }
      if (!isAbsolute(entry.repositoryRoot) || !isAbsolute(entry.worktreeParent)) {
        throw new Error("repository locator paths must be absolute")
      }
      if (!isAbsolute(entry.serviceBin)) {
        throw new Error("repository locator serviceBin must be absolute")
      }
      entries.set(entry.repositoryId, entry)
    }
    this.entries = entries
  }

  async locate(repositoryId: string): Promise<LocatedRepository> {
    requireOpaqueRepositoryId(repositoryId)
    const configured = this.entries.get(repositoryId)
    if (configured === undefined) {
      throw new Error("workspace repository identity is not registered")
    }
    const repositoryRoot = await realpath(resolve(configured.repositoryRoot)).catch(() => {
      throw new Error("workspace repository is unavailable")
    })
    const worktreeParent = await realpath(resolve(configured.worktreeParent)).catch(async () => {
      try {
        await mkdir(resolve(configured.worktreeParent), { recursive: true })
        return await realpath(resolve(configured.worktreeParent))
      } catch {
        throw new Error("workspace repository worktree parent is unavailable")
      }
    })
    if (isContainedPath(repositoryRoot, worktreeParent)) {
      throw new Error("workspace repository worktree parent must be outside the repository")
    }
    return {
      repositoryId,
      repositoryRoot,
      worktreeParent,
      serviceBin: configured.serviceBin,
      ...(configured.gitBin === undefined ? {} : { gitBin: configured.gitBin }),
      ...(configured.executionHost === undefined
        ? {}
        : { executionHost: configured.executionHost }),
      gitTimeoutMs: configured.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS
    }
  }
}

function requireOpaqueRepositoryId(repositoryId: string): void {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(repositoryId)) {
    throw new Error("repositoryId must be an opaque identifier")
  }
}

function isContainedPath(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}
