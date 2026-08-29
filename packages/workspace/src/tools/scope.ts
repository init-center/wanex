export function requireWorkspaceToolScopeId(value: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error("workspace Tool scopeId must be an opaque identifier")
  }
  return value
}
