export type CommandInputViewModel =
  | { readonly mode: "none" }
  | {
      readonly mode: "unsupported"
      readonly reason: "open_object" | "unrepresentable_bounds"
      readonly message: string
    }
  | {
      readonly mode: "generated"
      readonly root: CommandInputObjectControl
    }

export interface CommandInputControlBase {
  readonly path: string
  readonly label: string
  readonly required: boolean
  readonly description?: string
  readonly defaultHint?: string
}

export interface CommandInputObjectControl
  extends CommandInputControlBase {
  readonly kind: "object"
  readonly properties: readonly CommandInputControl[]
  readonly minProperties: number
  readonly maxProperties: number
}

export interface CommandInputArrayControl
  extends CommandInputControlBase {
  readonly kind: "array"
  readonly item: CommandInputControl
  readonly minItems: number
  readonly maxItems: number
  readonly uniqueItems: boolean
}

export interface CommandInputStringControl
  extends CommandInputControlBase {
  readonly kind: "string"
  readonly options?: readonly string[]
  readonly minLength?: number
  readonly maxLength?: number
}

export interface CommandInputNumberControl
  extends CommandInputControlBase {
  readonly kind: "number" | "integer"
  readonly options?: readonly number[]
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number
  readonly exclusiveMaximum?: number
}

export interface CommandInputBooleanControl
  extends CommandInputControlBase {
  readonly kind: "boolean"
  readonly options?: readonly boolean[]
}

export type CommandInputControl =
  | CommandInputObjectControl
  | CommandInputArrayControl
  | CommandInputStringControl
  | CommandInputNumberControl
  | CommandInputBooleanControl
