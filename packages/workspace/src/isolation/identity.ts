import { createHash } from "node:crypto"
import { resolve } from "node:path"

export function deterministicGitWorktreeIdentity(
  worktreeParent: string,
  isolationId: string
): { readonly rootDir: string; readonly runtimeRef: string } {
  const hash = createHash("sha256").update(isolationId).digest("hex").slice(0, 32)
  return {
    rootDir: resolve(worktreeParent, `wanex-${hash}`),
    runtimeRef: `wanex/runtime/${hash}`
  }
}
