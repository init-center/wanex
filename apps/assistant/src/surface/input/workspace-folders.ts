import type {
  GrantWorkspaceFolderRequest,
  ListWorkspaceFoldersRequest,
  RegrantWorkspaceFolderRequest,
  RevokeWorkspaceFolderRequest,
  WorkspaceFolderAccess
} from "../../workspace-folders.js"
import { record, requiredString, SurfaceValidationError } from "./common.js"

const FIELDS = {
  list: new Set(["sessionId"]),
  grant: new Set(["sessionId", "access", "idempotencyKey"]),
  regrant: new Set(["sessionId", "recentRef", "idempotencyKey"]),
  revoke: new Set(["sessionId", "grantId", "idempotencyKey"])
} as const

export function parseListWorkspaceFolders(value: unknown): ListWorkspaceFoldersRequest {
  if (value === undefined) return {}
  const input = strict(value, "workspace folder list", FIELDS.list)
  return optionalSession(input)
}

export function parseGrantWorkspaceFolder(value: unknown): GrantWorkspaceFolderRequest {
  const input = strict(value, "workspace folder grant", FIELDS.grant)
  return { ...optionalSession(input), access: access(input.access), idempotencyKey: requiredString(input, "idempotencyKey") }
}

export function parseRegrantWorkspaceFolder(value: unknown): RegrantWorkspaceFolderRequest {
  const input = strict(value, "workspace folder regrant", FIELDS.regrant)
  return { ...optionalSession(input), recentRef: requiredString(input, "recentRef"), idempotencyKey: requiredString(input, "idempotencyKey") }
}

export function parseRevokeWorkspaceFolder(value: unknown): RevokeWorkspaceFolderRequest {
  const input = strict(value, "workspace folder removal", FIELDS.revoke)
  return { ...optionalSession(input), grantId: requiredString(input, "grantId"), idempotencyKey: requiredString(input, "idempotencyKey") }
}

function strict(value: unknown, label: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  const input = record(value, label)
  const unknownField = Object.keys(input).find((key) => !allowed.has(key))
  if (unknownField !== undefined) throw new SurfaceValidationError(`${label} does not accept ${unknownField}`)
  return input
}

function optionalSession(input: Record<string, unknown>): { readonly sessionId?: string } {
  return input.sessionId === undefined ? {} : { sessionId: requiredString(input, "sessionId") }
}

function access(value: unknown): WorkspaceFolderAccess {
  if (value !== "read" && value !== "read_write") throw new SurfaceValidationError("workspace folder access must be read or read_write")
  return value
}
