export type ProductAppWebCommandInputViewModel =
  | { readonly mode: "raw" }
  | {
      readonly mode: "unsupported"
      readonly reason: "open_object" | "unrepresentable_bounds"
      readonly message: string
    }
  | {
      readonly mode: "generated"
      readonly root: ProductAppWebCommandInputObjectControl
    }

export interface ProductAppWebCommandInputControlBase {
  readonly path: string
  readonly label: string
  readonly required: boolean
  readonly description?: string
  readonly defaultHint?: string
}

export interface ProductAppWebCommandInputObjectControl
  extends ProductAppWebCommandInputControlBase {
  readonly kind: "object"
  readonly properties: readonly ProductAppWebCommandInputControl[]
}

export interface ProductAppWebCommandInputArrayControl
  extends ProductAppWebCommandInputControlBase {
  readonly kind: "array"
  readonly item: ProductAppWebCommandInputControl
  readonly minItems: number
  readonly maxItems: number
  readonly uniqueItems: boolean
}

export interface ProductAppWebCommandInputStringControl
  extends ProductAppWebCommandInputControlBase {
  readonly kind: "string"
  readonly options?: readonly string[]
  readonly minLength?: number
  readonly maxLength?: number
}

export interface ProductAppWebCommandInputNumberControl
  extends ProductAppWebCommandInputControlBase {
  readonly kind: "number" | "integer"
  readonly options?: readonly number[]
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number
  readonly exclusiveMaximum?: number
}

export interface ProductAppWebCommandInputBooleanControl
  extends ProductAppWebCommandInputControlBase {
  readonly kind: "boolean"
  readonly options?: readonly boolean[]
}

export type ProductAppWebCommandInputControl =
  | ProductAppWebCommandInputObjectControl
  | ProductAppWebCommandInputArrayControl
  | ProductAppWebCommandInputStringControl
  | ProductAppWebCommandInputNumberControl
  | ProductAppWebCommandInputBooleanControl
