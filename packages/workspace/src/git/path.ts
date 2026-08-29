import { WorkspacePathResolver, normalizeWorkspaceRelativePath } from "../path-policy.js"

export function validateRelativePath(path: string): void {
  normalizeWorkspaceRelativePath(path)
}

export async function resolveWorktreePath(
  rootDir: string,
  path: string,
  fileSystem: import("@wanex/runtime/execution").ExecutionFileSystem
): Promise<string> {
  return await new WorkspacePathResolver(rootDir, fileSystem).resolveMutation(path)
}

export async function resolveWorktreeEntry(
  rootDir: string,
  path: string,
  fileSystem: import("@wanex/runtime/execution").ExecutionFileSystem
): Promise<{
  readonly path: string
  readonly metadata: import("@wanex/runtime/execution").ExecutionFileMetadata
}> {
  return await new WorkspacePathResolver(rootDir, fileSystem).resolveReadEntry(path)
}
