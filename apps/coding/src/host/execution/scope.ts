import type {
  ApplicationScopeBinding,
  ExecutionEnvironmentBinding,
  JsonValue,
  SessionInputOrigin
} from "@wanex/protocol"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import {
  assertApplicationScopeBindingValid,
  assertExecutionEnvironmentBindingEqual,
  createApplicationScopeBinding,
  type ResolveSessionTurnAgentContextRequest
} from "@wanex/runtime/execution"
import { ToolRegistry } from "@wanex/runtime/tools"

const CODING_APPLICATION_SCOPE_KIND = "coding.workspace-task"

export interface CodingApplicationScopeMetadata {
  readonly repositoryId: string
  readonly workspaceId: string
  readonly access: "writable"
}

export interface CodingApplicationScopeBinding extends ApplicationScopeBinding {
  readonly kind: typeof CODING_APPLICATION_SCOPE_KIND
  readonly metadata: CodingApplicationScopeMetadata &
    Readonly<Record<string, JsonValue>>
}

interface CodingTurnScope {
  readonly executionEnvironment: ExecutionEnvironmentBinding
  readonly applicationScope: CodingApplicationScopeBinding
  readonly context: PreparedAgentContext
}

export class CodingTurnScopeRegistry {
  readonly #scopes = new Map<string, CodingTurnScope>()

  register(request: {
    readonly sessionId: string
    readonly inputId: string
    readonly turnId: string
    readonly executionEnvironment: ExecutionEnvironmentBinding
    readonly applicationScope: CodingApplicationScopeBinding
    readonly tools: ToolRegistry
    readonly baseContext?: PreparedAgentContext
    readonly toolPermissionPolicy: NonNullable<
      PreparedAgentContext["toolPermissionPolicy"]
    >
  }): () => void {
    const key = scopeKey(request)
    if (this.#scopes.has(key)) {
      throw new Error("coding Turn scope is already active")
    }
    assertCodingApplicationScope(request.applicationScope)
    const context = composeContext(
      request.baseContext,
      request.tools,
      request.toolPermissionPolicy
    )
    const scope = {
      executionEnvironment: request.executionEnvironment,
      applicationScope: request.applicationScope,
      context
    }
    this.#scopes.set(key, scope)
    return () => {
      if (this.#scopes.get(key) === scope) this.#scopes.delete(key)
    }
  }

  resolve = (
    request: ResolveSessionTurnAgentContextRequest
  ): { readonly context: PreparedAgentContext } => {
    const scope = this.#scopes.get(scopeKey(request))
    if (scope === undefined) {
      throw new Error("session Turn has no active Coding workspace scope")
    }
    assertOrigin(request.origin, scope.applicationScope)
    // Admission resolves context before Runtime creates the immutable Turn binding.
    if (request.phase === "admission") return { context: scope.context }
    const executionEnvironment = request.executionBinding.executionEnvironment
    if (executionEnvironment === undefined) {
      throw new Error("coding Turn execution environment binding is missing")
    }
    assertExecutionEnvironmentBindingEqual(
      executionEnvironment,
      scope.executionEnvironment,
      "coding Turn execution environment"
    )
    assertCodingApplicationScopeEqual(
      request.executionBinding.applicationScope,
      scope.applicationScope
    )
    return { context: scope.context }
  }

  get size(): number {
    return this.#scopes.size
  }
}

export function codingApplicationScope(request: {
  readonly repositoryId: string
  readonly workspaceId: string
  readonly taskId: string
}): CodingApplicationScopeBinding {
  requireOpaqueId(request.repositoryId, "coding repositoryId")
  requireOpaqueId(request.workspaceId, "coding workspaceId")
  requireOpaqueId(request.taskId, "coding taskId")
  return createApplicationScopeBinding({
    kind: CODING_APPLICATION_SCOPE_KIND,
    id: request.taskId,
    metadata: {
      repositoryId: request.repositoryId,
      workspaceId: request.workspaceId,
      access: "writable"
    }
  }) as CodingApplicationScopeBinding
}

export function codingTurnOrigin(
  scope: CodingApplicationScopeBinding,
  requestDigest: string
): SessionInputOrigin {
  if (!/^[a-f0-9]{64}$/u.test(requestDigest)) {
    throw new Error("coding Turn request digest is invalid")
  }
  return {
    kind: "coding",
    sourceRef: scope.id,
    parentRef: scope.metadata.repositoryId,
    metadata: {
      workspaceId: scope.metadata.workspaceId,
      access: scope.metadata.access,
      requestDigest
    }
  }
}

export function readCodingApplicationScope(
  value: ApplicationScopeBinding | undefined
): CodingApplicationScopeBinding | undefined {
  if (value === undefined) return undefined
  assertApplicationScopeBindingValid(value)
  if (value.kind !== CODING_APPLICATION_SCOPE_KIND) return undefined
  assertCodingApplicationScope(value)
  return value
}

export function assertCodingApplicationScopeEqual(
  value: ApplicationScopeBinding | undefined,
  expected: CodingApplicationScopeBinding
): void {
  const scope = readCodingApplicationScope(value)
  if (scope === undefined) {
    throw new Error("coding Turn application scope binding is missing or foreign")
  }
  if (scope.digest !== expected.digest) {
    throw new Error("coding Turn application scope binding changed after admission")
  }
}

function assertCodingApplicationScope(
  value: ApplicationScopeBinding
): asserts value is CodingApplicationScopeBinding {
  if (value.kind !== CODING_APPLICATION_SCOPE_KIND) {
    throw new Error("coding application scope kind is invalid")
  }
  const metadata = value.metadata
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    Object.keys(metadata).length !== 3 ||
    !("repositoryId" in metadata) ||
    !("workspaceId" in metadata) ||
    !("access" in metadata)
  ) {
    throw new Error("coding application scope metadata is invalid")
  }
  requireOpaqueId(metadata.repositoryId, "coding repositoryId")
  requireOpaqueId(metadata.workspaceId, "coding workspaceId")
  if (metadata.access !== "writable") {
    throw new Error("coding application scope access is invalid")
  }
  requireOpaqueId(value.id, "coding taskId")
}

function composeContext(
  base: PreparedAgentContext | undefined,
  scopedTools: ToolRegistry,
  toolPermissionPolicy: NonNullable<PreparedAgentContext["toolPermissionPolicy"]>
): PreparedAgentContext {
  return {
    ...(base ?? {}),
    tools: mergeTools(base?.tools, scopedTools),
    toolPermissionPolicy
  }
}

function mergeTools(
  base: ToolRegistry | undefined,
  scoped: ToolRegistry
): ToolRegistry {
  if (base === undefined) return scoped
  const merged = new ToolRegistry()
  for (const registry of [base, scoped]) {
    for (const descriptor of registry.list()) {
      const definition = registry.get(descriptor.name)
      if (definition === undefined) {
        throw new Error(
          `coding Tool registry changed during composition: ${descriptor.name}`
        )
      }
      merged.register(definition)
    }
  }
  return merged
}

function assertOrigin(
  origin: SessionInputOrigin | undefined,
  scope: CodingApplicationScopeBinding
): void {
  if (
    origin?.kind !== "coding" ||
    origin.sourceRef !== scope.id ||
    origin.parentRef !== scope.metadata.repositoryId ||
    origin.metadata?.workspaceId !== scope.metadata.workspaceId ||
    origin.metadata.access !== scope.metadata.access ||
    !isRequestDigest(origin.metadata.requestDigest)
  ) {
    throw new Error("coding Turn origin does not match its active workspace scope")
  }
}

function isRequestDigest(value: JsonValue | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)
}

function requireOpaqueId(value: JsonValue, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error(`${label} must be an opaque identifier`)
  }
}

function scopeKey(request: {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
}): string {
  return `${request.sessionId}\0${request.inputId}\0${request.turnId}`
}
