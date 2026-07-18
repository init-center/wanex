import { type WorkspaceFileChange } from "@wanex/protocol"

import { expectString } from "./codec-common.js"

export function expectWorkspaceFileChangeKind(
  value: unknown,
  name: string
): WorkspaceFileChange["kind"] {
  const kind = expectString(value, name)
  if (kind !== "create" && kind !== "update" && kind !== "delete") {
    throw new Error(`invalid workspace file change kind: ${kind}`)
  }
  return kind
}
