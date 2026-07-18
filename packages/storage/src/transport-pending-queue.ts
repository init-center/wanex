export interface PendingTransportCall {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

export class PendingTransportCallQueue {
  private readonly pending: PendingTransportCall[] = []

  push(pending: PendingTransportCall): void {
    this.pending.push(pending)
  }

  shift(): PendingTransportCall | undefined {
    return this.pending.shift()
  }

  rejectAll(error: Error): void {
    while (this.pending.length > 0) {
      this.pending.shift()?.reject(error)
    }
  }

  remove(pending: PendingTransportCall): void {
    const index = this.pending.indexOf(pending)
    if (index >= 0) {
      this.pending.splice(index, 1)
    }
  }
}
