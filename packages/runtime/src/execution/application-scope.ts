import { createHash } from "node:crypto"
import type { ApplicationScopeBinding, JsonValue } from "@wanex/protocol"

export function createApplicationScopeBinding(request: {
  readonly kind: string
  readonly id: string
  readonly metadata: JsonValue
}): ApplicationScopeBinding {
  requireScopeString(request.kind, "application scope kind")
  requireScopeString(request.id, "application scope id")
  const unsigned = {
    kind: request.kind,
    id: request.id,
    metadata: request.metadata
  }
  return Object.freeze({
    ...unsigned,
    digest: digestJson(unsigned)
  })
}

export function assertApplicationScopeBindingValid(
  binding: ApplicationScopeBinding
): void {
  if (
    binding === null ||
    typeof binding !== "object" ||
    Array.isArray(binding) ||
    Object.keys(binding).length !== 4 ||
    !Object.prototype.hasOwnProperty.call(binding, "kind") ||
    !Object.prototype.hasOwnProperty.call(binding, "id") ||
    !Object.prototype.hasOwnProperty.call(binding, "digest") ||
    !Object.prototype.hasOwnProperty.call(binding, "metadata")
  ) {
    throw new Error("application scope binding is invalid")
  }
  requireScopeString(binding.kind, "application scope kind")
  requireScopeString(binding.id, "application scope id")
  if (!/^[a-f0-9]{64}$/u.test(binding.digest)) {
    throw new Error("application scope digest is invalid")
  }
  const { digest: _digest, ...unsigned } = binding
  if (digestJson(unsigned) !== binding.digest) {
    throw new Error("application scope digest does not match its content")
  }
}

function requireScopeString(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error(`${label} must be a non-empty string of at most 256 characters`)
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
