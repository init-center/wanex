export interface PendingTransportCall {
  readonly requestId: string
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

export class PendingTransportCalls {
  private readonly pending = new Map<string, PendingTransportCall>()

  has(requestId: string): boolean {
    return this.pending.has(requestId)
  }

  push(pending: PendingTransportCall): void {
    this.pending.set(pending.requestId, pending)
  }

  take(requestId: string): PendingTransportCall | undefined {
    const pending = this.pending.get(requestId)
    this.pending.delete(requestId)
    return pending
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  remove(pending: PendingTransportCall): void {
    if (this.pending.get(pending.requestId) === pending) {
      this.pending.delete(pending.requestId)
    }
  }
}
