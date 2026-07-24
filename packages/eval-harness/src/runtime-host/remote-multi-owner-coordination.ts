export type RemoteHostOwner = "host-a" | "host-b"

export interface ProviderGateHandle {
  readonly ready: Promise<void>
  release(): void
}

interface ProviderGate {
  readonly expected: number
  entered: number
  readonly ready: Deferred<void>
  readonly released: Deferred<void>
}

export class RemoteMultiOwnerCoordinator {
  readonly cancellationStarted = deferred<void>()
  readonly cancellationAborted = deferred<void>()
  active = 0
  maxActive = 0
  sameSessionMaxActive = 0
  cancellationAbortCount = 0
  private sameSessionActive = 0
  private gate: ProviderGate | undefined
  private readonly dispatches = new Map<string, number>()
  private readonly ownerDispatches = new Map<RemoteHostOwner, number>()

  get dispatchCount(): number {
    return [...this.dispatches.values()].reduce((sum, count) => sum + count, 0)
  }

  get duplicateDispatchLabels(): string[] {
    return [...this.dispatches]
      .filter(([, count]) => count !== 1)
      .map(([label]) => label)
      .sort()
  }

  ownerDispatchCount(owner: RemoteHostOwner): number {
    return this.ownerDispatches.get(owner) ?? 0
  }

  armGate(expected: number): ProviderGateHandle {
    if (!Number.isInteger(expected) || expected <= 0) {
      throw new Error("provider gate capacity must be a positive integer")
    }
    if (this.gate !== undefined) {
      throw new Error("provider gate is already armed")
    }
    const ready = deferred<void>()
    const released = deferred<void>()
    const gate: ProviderGate = { expected, entered: 0, ready, released }
    this.gate = gate
    return {
      ready: ready.promise,
      release: () => {
        if (this.gate !== gate || gate.entered !== expected) {
          throw new Error("provider gate released before its exact capacity")
        }
        this.gate = undefined
        released.resolve()
      }
    }
  }

  abortGate(): void {
    const gate = this.gate
    if (gate === undefined) {
      return
    }
    this.gate = undefined
    gate.released.resolve()
  }

  async enter(
    owner: RemoteHostOwner,
    label: string
  ): Promise<() => void> {
    this.dispatches.set(label, (this.dispatches.get(label) ?? 0) + 1)
    this.ownerDispatches.set(owner, (this.ownerDispatches.get(owner) ?? 0) + 1)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    const sameSession = label.startsWith("same-session-")
    if (sameSession) {
      this.sameSessionActive += 1
      this.sameSessionMaxActive = Math.max(
        this.sameSessionMaxActive,
        this.sameSessionActive
      )
    }
    const gate = this.gate
    if (gate !== undefined) {
      gate.entered += 1
      if (gate.entered > gate.expected) {
        this.leave(sameSession)
        throw new Error("provider gate admitted too many executions")
      }
      if (gate.entered === gate.expected) {
        gate.ready.resolve()
      }
      await gate.released.promise
    }
    let left = false
    return () => {
      if (left) {
        return
      }
      left = true
      this.leave(sameSession)
    }
  }

  private leave(sameSession: boolean): void {
    this.active -= 1
    if (sameSession) {
      this.sameSessionActive -= 1
    }
  }
}

export class ScenarioRunScope {
  private readonly runs: Promise<unknown>[] = []

  track<T>(run: Promise<T>): Promise<T> {
    this.runs.push(run)
    void run.catch(() => {})
    return run
  }

  async join(): Promise<void> {
    await Promise.allSettled(this.runs)
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
