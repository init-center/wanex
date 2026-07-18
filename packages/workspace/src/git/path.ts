import { WorkspacePathResolver, normalizeWorkspaceRelativePath } from "../path-policy.js"

export function validateRelativePath(path: string): void {
  normalizeWorkspaceRelativePath(path)
}

export async function resolveWorktreePath(
  rootDir: string,
  path: string
): Promise<string> {
  return await new WorkspacePathResolver(rootDir).resolveRead(path)
}
