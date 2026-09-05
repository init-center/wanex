import type { SessionTurnExecutionBinding } from "@wanex/protocol"
import type {
  ResolveSessionTurnAgentContextRequest,
  ResolvedSessionTurnAgentContext,
  SessionTurnAgentContextIdentity,
  SessionTurnAgentContextLease,
} from "@wanex/runtime/execution"
import type { RuntimeHostSessionTurnLifecycleSignal } from "@wanex/runtime/host"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import type { CoreStore } from "@wanex/storage"
import { prepareLocalMcpComposition } from "./composition.js"
import type {
  LocalMcpComposition,
  LocalMcpServerStatus,
} from "./model.js"

interface McpGeneration {
  readonly sequence: number
  readonly identity: SessionTurnAgentContextIdentity
  readonly composition: LocalMcpComposition
  readonly evidence: ReadonlySet<string>
  readonly pending: Set<symbol>
  readonly owners: Set<string>
  retired: boolean
  disposal?: Promise<void>
}

interface McpOwner {
  readonly generation: McpGeneration
  readonly bindingDigest: string
}

interface LocalMcpGenerationControllerOptions {
  readonly storage: Pick<CoreStore, "listConfigEntries">
  readonly secretResolver: SecretResolverPort
  readonly serviceBin?: string
}

export interface LocalMcpReloadResult {
  readonly outcome: "published" | "unchanged" | "rejected"
  readonly status: readonly LocalMcpServerStatus[]
}

export interface LocalMcpGenerationController {
  resolve(
    request: ResolveSessionTurnAgentContextRequest
  ): ResolvedSessionTurnAgentContext | undefined
  observeTurnLifecycle(signal: RuntimeHostSessionTurnLifecycleSignal): void
  reload(options?: { readonly force?: boolean }): Promise<LocalMcpReloadResult>
  status(): readonly LocalMcpServerStatus[]
  dispose(): Promise<void>
}

export async function createLocalMcpGenerationController(
  options: LocalMcpGenerationControllerOptions
): Promise<LocalMcpGenerationController> {
  const initial = await prepareLocalMcpComposition(options)
  return new LocalMcpGenerationControllerImpl(options, initial)
}

class LocalMcpGenerationControllerImpl
  implements LocalMcpGenerationController {
  readonly #options: LocalMcpGenerationControllerOptions
  readonly #generations = new Set<McpGeneration>()
  readonly #owners = new Map<string, McpOwner>()
  readonly #pendingByTurn = new Map<string, number>()
  readonly #earlyTerminalTurns = new Set<string>()
  readonly #backgroundDisposals = new Set<Promise<void>>()
  readonly #cleanupFailures: unknown[] = []
  #active: McpGeneration
  #nextSequence = 1
  #reloadTail: Promise<unknown> = Promise.resolve()
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(
    options: LocalMcpGenerationControllerOptions,
    initial: LocalMcpComposition
  ) {
    this.#options = options
    this.#active = this.#createGeneration(initial)
  }

  resolve(
    request: ResolveSessionTurnAgentContextRequest
  ): ResolvedSessionTurnAgentContext | undefined {
    if (this.#disposed) throw new Error("MCP generation controller is disposed")
    if (request.phase !== "admission") {
      const generation = this.#resolveBoundGeneration(
        request,
        request.executionBinding,
        request.phase === "execution"
      )
      if (generation?.composition.tools === undefined) return undefined
      if (request.phase === "inheritance") {
        const turnKey = contextTurnKey(request)
        const token = Symbol(turnKey)
        generation.pending.add(token)
        this.#pendingByTurn.set(turnKey, (this.#pendingByTurn.get(turnKey) ?? 0) + 1)
        return {
          context: { tools: generation.composition.tools },
          contextIdentity: generation.identity,
          lease: this.#createLease(generation, token, turnKey, "inheritance"),
        }
      }
      return generation?.composition.tools === undefined
        ? undefined
        : {
            context: { tools: generation.composition.tools },
            contextIdentity: generation.identity,
          }
    }
    const generation = this.#active
    if (generation.composition.tools === undefined || generation.evidence.size === 0) {
      return undefined
    }
    const turnKey = contextTurnKey(request)
    const token = Symbol(turnKey)
    generation.pending.add(token)
    this.#pendingByTurn.set(turnKey, (this.#pendingByTurn.get(turnKey) ?? 0) + 1)
    return {
      context: { tools: generation.composition.tools },
      contextIdentity: generation.identity,
      lease: this.#createLease(generation, token, turnKey, "admission"),
    }
  }

  observeTurnLifecycle(signal: RuntimeHostSessionTurnLifecycleSignal): void {
    if (signal.phase === "suspended") return
    const turnKey = resultTurnKey(signal)
    const owner = this.#owners.get(turnKey)
    if (owner !== undefined) {
      this.#owners.delete(turnKey)
      owner.generation.owners.delete(turnKey)
      this.#scheduleDisposalIfUnused(owner.generation)
      return
    }
    if ((this.#pendingByTurn.get(turnKey) ?? 0) > 0) {
      this.#earlyTerminalTurns.add(turnKey)
    }
  }

  reload(
    options: { readonly force?: boolean } = {}
  ): Promise<LocalMcpReloadResult> {
    const reload = this.#reloadTail.then(
      async () => await this.#reloadNow(options),
      async () => await this.#reloadNow(options)
    )
    this.#reloadTail = reload.catch(() => undefined)
    return reload
  }

  status(): readonly LocalMcpServerStatus[] {
    return this.#active.composition.status()
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise
    this.#disposed = true
    this.#disposePromise = (async () => {
      await this.#reloadTail.catch(() => undefined)
      this.#owners.clear()
      this.#pendingByTurn.clear()
      this.#earlyTerminalTurns.clear()
      for (const generation of this.#generations) {
        generation.pending.clear()
        generation.owners.clear()
        this.#scheduleDisposal(generation)
      }
      await Promise.allSettled([...this.#backgroundDisposals])
      if (this.#cleanupFailures.length > 0) {
        throw new AggregateError(
          this.#cleanupFailures,
          "MCP generation cleanup failed"
        )
      }
    })()
    return this.#disposePromise
  }

  async #reloadNow(
    options: { readonly force?: boolean }
  ): Promise<LocalMcpReloadResult> {
    if (this.#disposed) throw new Error("MCP generation controller is disposed")
    const candidateComposition = await prepareLocalMcpComposition(this.#options)
    if (this.#disposed) {
      await candidateComposition.dispose()
      throw new Error("MCP generation controller is disposed")
    }
    if (
      options.force !== true &&
      candidateComposition.fingerprint === this.#active.composition.fingerprint
    ) {
      await candidateComposition.dispose()
      return { outcome: "unchanged", status: this.status() }
    }
    const candidateStatus = candidateComposition.status()
    const hasReady = candidateStatus.some((status) => status.state === "ready")
    const hasFailure = candidateStatus.some((status) => status.state === "failed")
    if (!hasReady && hasFailure) {
      await candidateComposition.dispose()
      return { outcome: "rejected", status: candidateStatus }
    }

    const candidate = this.#createGeneration(candidateComposition)
    const previous = this.#active
    this.#active = candidate
    previous.retired = true
    this.#scheduleDisposalIfUnused(previous)
    return { outcome: "published", status: candidate.composition.status() }
  }

  #createGeneration(composition: LocalMcpComposition): McpGeneration {
    const generation: McpGeneration = {
      sequence: this.#nextSequence,
      identity: Symbol(
        `wanex.mcp.generation:${this.#nextSequence}`
      ) as SessionTurnAgentContextIdentity,
      composition,
      evidence: generationEvidence(composition),
      pending: new Set(),
      owners: new Set(),
      retired: false,
    }
    this.#nextSequence += 1
    this.#generations.add(generation)
    return generation
  }

  #createLease(
    generation: McpGeneration,
    token: symbol,
    turnKey: string,
    phase: SessionTurnAgentContextLease["phase"]
  ): SessionTurnAgentContextLease {
    let settled = false
    return Object.freeze({
      phase,
      commit: (binding: SessionTurnExecutionBinding) => {
        if (settled) return
        settled = true
        this.#releasePending(generation, token, turnKey)
        if (
          !this.#disposed &&
          !this.#earlyTerminalTurns.has(turnKey) &&
          bindingContainsGeneration(binding, generation)
        ) {
          const existing = this.#owners.get(turnKey)
          if (
            existing === undefined ||
            (existing.generation === generation &&
              existing.bindingDigest === binding.digest)
          ) {
            this.#owners.set(turnKey, {
              generation,
              bindingDigest: binding.digest,
            })
            generation.owners.add(turnKey)
          }
        }
        this.#clearEarlyTerminalIfSettled(turnKey)
        this.#scheduleDisposalIfUnused(generation)
      },
      rollback: () => {
        if (settled) return
        settled = true
        this.#releasePending(generation, token, turnKey)
        this.#clearEarlyTerminalIfSettled(turnKey)
        this.#scheduleDisposalIfUnused(generation)
      },
    })
  }

  #releasePending(
    generation: McpGeneration,
    token: symbol,
    turnKey: string
  ): void {
    if (!generation.pending.delete(token)) return
    const remaining = (this.#pendingByTurn.get(turnKey) ?? 1) - 1
    if (remaining <= 0) this.#pendingByTurn.delete(turnKey)
    else this.#pendingByTurn.set(turnKey, remaining)
  }

  #clearEarlyTerminalIfSettled(turnKey: string): void {
    if ((this.#pendingByTurn.get(turnKey) ?? 0) === 0) {
      this.#earlyTerminalTurns.delete(turnKey)
    }
  }

  #resolveBoundGeneration(
    request: ResolveSessionTurnAgentContextRequest,
    executionBinding: SessionTurnExecutionBinding,
    claimOwner: boolean
  ): McpGeneration | undefined {
    const turnKey = contextTurnKey(request)
    const owner = this.#owners.get(turnKey)
    if (owner !== undefined) {
      if (owner.bindingDigest !== executionBinding.digest) {
        throw new Error("MCP Turn owner does not match its execution binding")
      }
      if (
        request.contextIdentity !== undefined &&
        owner.generation.identity !== request.contextIdentity
      ) {
        throw new Error("MCP Turn owner does not match its context generation")
      }
      return owner.generation
    }
    if (request.contextIdentity !== undefined) {
      const generation = [...this.#generations].find((candidate) =>
        candidate.identity === request.contextIdentity &&
        candidate.disposal === undefined
      )
      if (generation === undefined) {
        throw new Error("MCP context generation is no longer available")
      }
      if (!bindingContainsGeneration(executionBinding, generation)) {
        throw new Error("MCP context generation does not match its execution binding")
      }
      if (claimOwner) {
        this.#owners.set(turnKey, {
          generation,
          bindingDigest: executionBinding.digest,
        })
        generation.owners.add(turnKey)
      }
      return generation
    }
    const candidates = [this.#active, ...[...this.#generations]
      .filter((generation) => generation !== this.#active)
      .sort((left, right) => right.sequence - left.sequence)]
    const matching = candidates.filter((candidate) =>
      candidate.disposal === undefined &&
      candidate.evidence.size > 0 &&
      bindingContainsGeneration(executionBinding, candidate)
    )
    if (matching.length > 1) {
      throw new Error("MCP execution binding matches multiple context generations")
    }
    const generation = matching[0]
    if (generation === undefined) return undefined
    if (claimOwner) {
      this.#owners.set(turnKey, {
        generation,
        bindingDigest: executionBinding.digest,
      })
      generation.owners.add(turnKey)
    }
    return generation
  }

  #scheduleDisposalIfUnused(generation: McpGeneration): void {
    if (
      generation.retired &&
      generation.pending.size === 0 &&
      generation.owners.size === 0
    ) {
      this.#scheduleDisposal(generation)
    }
  }

  #scheduleDisposal(generation: McpGeneration): void {
    if (generation.disposal !== undefined) return
    generation.disposal = generation.composition.dispose()
    const observed = generation.disposal
      .catch((error) => {
        this.#cleanupFailures.push(error)
      })
      .finally(() => {
        this.#backgroundDisposals.delete(observed)
        this.#generations.delete(generation)
      })
    this.#backgroundDisposals.add(observed)
  }
}

function generationEvidence(composition: LocalMcpComposition): ReadonlySet<string> {
  return new Set(
    (composition.tools?.snapshot().tools ?? [])
      .map((tool) => stableJson(tool))
  )
}

function bindingContainsGeneration(
  binding: SessionTurnExecutionBinding,
  generation: McpGeneration
): boolean {
  if (generation.evidence.size === 0) return false
  const snapshot = binding.toolSnapshot
  if (!isRecord(snapshot) || !Array.isArray(snapshot.tools)) return false
  const mcpEvidence = new Set(
    snapshot.tools
      .filter(isMcpToolEvidence)
      .map((tool) => stableJson(tool))
  )
  return mcpEvidence.size === generation.evidence.size &&
    [...generation.evidence].every((tool) => mcpEvidence.has(tool))
}

function isMcpToolEvidence(value: unknown): boolean {
  if (!isRecord(value)) return false
  const runtimeBinding = value.runtimeBinding
  if (!isRecord(runtimeBinding)) return false
  return typeof runtimeBinding.implementationId === "string" &&
    runtimeBinding.implementationId.startsWith("wanex.mcp.client:")
}

function contextTurnKey(request: {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
}): string {
  return JSON.stringify([request.sessionId, request.inputId, request.turnId])
}

function resultTurnKey(signal: RuntimeHostSessionTurnLifecycleSignal): string {
  return contextTurnKey(signal.reference)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`
}
