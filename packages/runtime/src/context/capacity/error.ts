import type { ContextCapacityFailureDetail } from "./types.js"

export class ContextCapacityError extends Error {
  readonly detail: ContextCapacityFailureDetail

  constructor(detail: ContextCapacityFailureDetail) {
    const reasons = detail.estimate.reasons.join(", ")
    super(`Provider request exceeds known model capacity: ${reasons}`)
    this.name = "ContextCapacityError"
    this.detail = detail
  }
}
