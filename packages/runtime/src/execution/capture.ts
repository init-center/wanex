import type { ExecutionOutput } from "./types.js"

export class BoundedExecutionCapture {
  private readonly headLimit: number
  private readonly tailLimit: number
  private head = Buffer.alloc(0)
  private tail = Buffer.alloc(0)
  private observed = 0

  constructor(readonly limitBytes: number) {
    if (!Number.isInteger(limitBytes) || limitBytes < 0) {
      throw new Error("execution output limit must be a non-negative integer")
    }
    this.headLimit = Math.ceil(limitBytes / 2)
    this.tailLimit = Math.floor(limitBytes / 2)
  }

  append(chunk: Uint8Array): void {
    const bytes = Buffer.from(chunk)
    this.observed += bytes.byteLength
    let offset = 0

    if (this.head.byteLength < this.headLimit) {
      const take = Math.min(
        this.headLimit - this.head.byteLength,
        bytes.byteLength
      )
      this.head = Buffer.concat([this.head, bytes.subarray(0, take)])
      offset = take
    }

    if (this.tailLimit === 0 || offset >= bytes.byteLength) {
      return
    }
    const combined = Buffer.concat([this.tail, bytes.subarray(offset)])
    this.tail = combined.subarray(
      Math.max(0, combined.byteLength - this.tailLimit)
    )
  }

  snapshot(): ExecutionOutput {
    const retained = Buffer.concat([this.head, this.tail])
    return {
      bytes: retained,
      text: retained.toString("utf8"),
      observedBytes: this.observed,
      retainedBytes: retained.byteLength,
      truncated: this.observed > retained.byteLength
    }
  }
}
