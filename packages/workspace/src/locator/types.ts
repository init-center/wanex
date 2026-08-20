import type { ExecutionHost } from "@wanex/runtime/execution"

export interface RepositoryLocatorEntry {
  readonly repositoryId: string
  readonly repositoryRoot: string
  readonly worktreeParent: string
  readonly serviceBin: string
  readonly gitBin?: string
  readonly executionHost?: ExecutionHost
  readonly gitTimeoutMs?: number
}

export interface LocatedRepository {
  readonly repositoryId: string
  readonly repositoryRoot: string
  readonly worktreeParent: string
  readonly serviceBin: string
  readonly gitBin?: string
  readonly executionHost?: ExecutionHost
  readonly gitTimeoutMs: number
}

export interface RepositoryLocator {
  locate(repositoryId: string): Promise<LocatedRepository>
}

export interface LocalRepositoryLocatorOptions {
  readonly repositories: readonly RepositoryLocatorEntry[]
}
