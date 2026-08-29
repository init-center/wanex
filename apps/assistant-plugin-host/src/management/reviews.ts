import { randomUUID } from "node:crypto"
import type { LocalPluginPackageInspection } from "@wanex/plugin"
import type { LocalPluginReview } from "@wanex/assistant/plugin-management"
import type { ResolvedPluginCommandManagementOptions } from "./options.js"
import { projectLocalPluginReview } from "./projection.js"

export interface PendingLocalPluginReview {
  readonly sourceDir: string
  readonly inspection: LocalPluginPackageInspection
  readonly expiresAt: number
  readonly review: LocalPluginReview
}

export type ClaimLocalPluginReviewResult =
  | { readonly kind: "found"; readonly pending: PendingLocalPluginReview }
  | { readonly kind: "expired" }
  | { readonly kind: "not_found" }

export class LocalPluginReviewRegistry {
  private readonly pending = new Map<string, PendingLocalPluginReview>()

  constructor(
    private readonly options: Pick<
      ResolvedPluginCommandManagementOptions,
      "maxPendingReviews" | "reviewTtlMs" | "now"
    >,
  ) {}

  hasCapacity(): boolean {
    this.cleanExpired()
    return this.pending.size < this.options.maxPendingReviews
  }

  add(inspection: LocalPluginPackageInspection): LocalPluginReview {
    this.cleanExpired()
    if (this.pending.size >= this.options.maxPendingReviews) {
      throw new Error("review capacity reached")
    }
    const reviewId = this.nextId()
    const now = this.options.now()
    const expiresAt = now + this.options.reviewTtlMs
    if (!Number.isSafeInteger(expiresAt)) {
      throw new Error("review expiry exceeds the safe integer range")
    }
    const review = projectLocalPluginReview(reviewId, expiresAt, inspection)
    this.pending.set(reviewId, {
      sourceDir: inspection.sourceDir,
      inspection,
      expiresAt,
      review,
    })
    return review
  }

  claim(reviewId: string): ClaimLocalPluginReviewResult {
    const pending = this.pending.get(reviewId)
    if (pending === undefined) {
      this.cleanExpired()
      return { kind: "not_found" }
    }
    this.pending.delete(reviewId)
    if (pending.expiresAt <= this.options.now()) {
      this.cleanExpired()
      return { kind: "expired" }
    }
    this.cleanExpired()
    return { kind: "found", pending }
  }

  cancel(reviewId: string): ClaimLocalPluginReviewResult["kind"] {
    return this.claim(reviewId).kind
  }

  clear(): void {
    this.pending.clear()
  }

  private cleanExpired(): void {
    const now = this.options.now()
    for (const [reviewId, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(reviewId)
    }
  }

  private nextId(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const reviewId = `plugin-review_${randomUUID()}`
      if (!this.pending.has(reviewId)) return reviewId
    }
    throw new Error("review id allocation failed")
  }
}
