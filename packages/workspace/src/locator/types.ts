import type { ExecutionFileSystem } from "@wanex/runtime/execution"

export interface RepositoryLocatorEntry {
  readonly repositoryId: string
  readonly repositoryRoot: string
  readonly worktreeParent: string
  readonly serviceBin: string
  readonly fileSystem: ExecutionFileSystem
  readonly gitBin?: string
  readonly gitTimeoutMs?: number
}

export interface LocatedRepository {
  readonly repositoryId: string
  readonly repositoryRoot: string
  readonly worktreeParent: string
  readonly serviceBin: string
  readonly fileSystem: ExecutionFileSystem
  readonly gitBin?: string
  readonly gitTimeoutMs: number
}

export interface RepositoryLocator {
  locate(repositoryId: string): Promise<LocatedRepository>
}

export interface LocalRepositoryLocatorOptions {
  readonly repositories: readonly RepositoryLocatorEntry[]
}
