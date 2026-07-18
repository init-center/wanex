import type { ProductAppExecuteCommandResult } from "@wanex/product-app/surface-client"

export interface ProductAppWebCommandPreviewProviderViewModel {
  readonly status: string
  readonly reason: string
  readonly activeProfileId: string
  readonly canRun: boolean
  readonly attentionRequired: boolean
}

export type ProductAppWebCommandExecutionState =
  | "empty"
  | ProductAppExecuteCommandResult["kind"]

export interface ProductAppWebCommandExecutionViewModel {
  readonly kind: "product-app-web.command-execution"
  readonly state: ProductAppWebCommandExecutionState
  readonly message: string
  readonly commandId?: string
  readonly handlerRef?: string
  readonly reason?: string
  readonly valueKind?: string
  readonly references: readonly ProductAppWebCommandExecutionReference[]
  readonly provider?: ProductAppWebCommandPreviewProviderViewModel
  readonly inputValidation?: ProductAppWebCommandInputValidationViewModel
  readonly updatedAt?: number
}

export interface ProductAppWebCommandInputValidationViewModel {
  readonly source: "schema" | "handler"
  readonly issues: readonly ProductAppWebCommandInputValidationIssueViewModel[]
}

export interface ProductAppWebCommandInputValidationIssueViewModel {
  readonly path: string
  readonly keyword: string
  readonly message: string
}

export interface ProductAppWebCommandExecutionReference {
  readonly kind: string
  readonly id: string
}
