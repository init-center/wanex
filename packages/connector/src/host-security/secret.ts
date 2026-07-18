import { inspect } from "node:util"
import type { ResolvedSecret } from "./types.js"

export class InMemoryResolvedSecret implements ResolvedSecret {
  readonly ref: string
  readonly provider: string
  #value: string | undefined

  constructor(options: {
    readonly ref: string
    readonly provider: string
    readonly value: string
  }) {
    if (options.value.length === 0) {
      throw new Error("secret value must not be empty")
    }
    this.ref = options.ref
    this.provider = options.provider
    this.#value = options.value
  }

  get disposed(): boolean {
    return this.#value === undefined
  }

  reveal(): string {
    if (this.#value === undefined) {
      throw new Error(`secret has been disposed: ${this.ref}`)
    }
    return this.#value
  }

  dispose(): void {
    this.#value = undefined
  }

  toJSON(): never {
    throw new Error(`secret cannot be JSON serialized: ${this.ref}`)
  }

  toString(): string {
    return `[WanexSecret ${this.provider}:${this.ref}]`
  }

  [inspect.custom](): string {
    return this.toString()
  }
}
