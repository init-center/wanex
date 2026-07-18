import type {
  ProductAppExecutionReferenceReadResult,
  ProductAppReadExecutionReferenceRequest
} from "@wanex/product-app/surface-client"

export type ProductAppWebExecutionActivityState =
  | "empty"
  | "submitted"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "missing"
  | "unsupported"
  | "unavailable"

export interface ProductAppWebExecutionActivityViewModel {
  readonly kind: "product-app-web.execution-activity"
  readonly state: ProductAppWebExecutionActivityState
  readonly message: string
  readonly reference?: ProductAppReadExecutionReferenceRequest
  readonly jobKind?: string
  readonly schedulerState?: string
  readonly attempt?: number
  readonly maxAttempts?: number
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly createdAt?: number
  readonly updatedAt?: number
  readonly finishedAt?: number
  readonly failureCategory?: string
  readonly refreshedAt?: number
}

export type ProductAppWebExecutionReferenceRequest =
  ProductAppReadExecutionReferenceRequest
export type ProductAppWebExecutionActivitySource =
  ProductAppExecutionReferenceReadResult
