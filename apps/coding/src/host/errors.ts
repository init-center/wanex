import type { CodingHostErrorCode } from "./types.js"

export class CodingHostError extends Error {
  readonly code: CodingHostErrorCode

  constructor(code: CodingHostErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "CodingHostError"
    this.code = code
  }
}
