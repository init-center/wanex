export const APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12 =
  "https://json-schema.org/draft/2020-12/schema" as const

export interface AppCommandInputSchemaLimits {
  readonly maxSerializedBytes: number
  readonly maxSchemaDepth: number
  readonly maxSchemaNodes: number
  readonly maxProperties: number
  readonly maxPropertyNameLength: number
  readonly maxTitleLength: number
  readonly maxDescriptionLength: number
  readonly maxEnumValuesPerNode: number
  readonly maxEnumValuesTotal: number
  readonly maxRequiredNames: number
  readonly maxStringLengthBound: number
  readonly maxCollectionBound: number
  readonly maxValueDepth: number
  readonly maxValueNodes: number
}

export interface ParseAppCommandInputSchemaOptions {
  readonly limits?: Partial<AppCommandInputSchemaLimits>
}

export type AppCommandInputSchemaErrorCode =
  | "invalid"
  | "unsupported"
  | "limit_exceeded"

export interface AppCommandInputSchemaError {
  readonly code: AppCommandInputSchemaErrorCode
  readonly path: string
  readonly message: string
}

export type ParseAppCommandInputSchemaResult =
  | {
      readonly ok: true
      readonly value: AppCommandInputSchema
    }
  | {
      readonly ok: false
      readonly error: AppCommandInputSchemaError
    }

export type AppCommandInputJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly AppCommandInputJsonValue[]
  | { readonly [key: string]: AppCommandInputJsonValue }

export interface AppCommandInputSchemaAnnotations {
  readonly title?: string
  readonly description?: string
}

export interface AppCommandInputObjectSchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "object"
  readonly properties?: Readonly<Record<string, AppCommandInputValueSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
  readonly minProperties?: number
  readonly maxProperties?: number
  readonly default?: Readonly<Record<string, AppCommandInputJsonValue>>
}

export interface AppCommandInputSchema extends AppCommandInputObjectSchema {
  readonly $schema?: typeof APP_COMMAND_INPUT_SCHEMA_DRAFT_2020_12
}

export interface AppCommandInputStringSchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "string"
  readonly enum?: readonly string[]
  readonly minLength?: number
  readonly maxLength?: number
  readonly default?: string
}

export interface AppCommandInputNumberSchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "number"
  readonly enum?: readonly number[]
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number
  readonly exclusiveMaximum?: number
  readonly default?: number
}

export interface AppCommandInputIntegerSchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "integer"
  readonly enum?: readonly number[]
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number
  readonly exclusiveMaximum?: number
  readonly default?: number
}

export interface AppCommandInputBooleanSchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "boolean"
  readonly enum?: readonly boolean[]
  readonly default?: boolean
}

export interface AppCommandInputArraySchema
  extends AppCommandInputSchemaAnnotations {
  readonly type: "array"
  readonly items: AppCommandInputValueSchema
  readonly minItems?: number
  readonly maxItems?: number
  readonly uniqueItems?: boolean
  readonly default?: readonly AppCommandInputJsonValue[]
}

export type AppCommandInputValueSchema =
  | AppCommandInputObjectSchema
  | AppCommandInputStringSchema
  | AppCommandInputNumberSchema
  | AppCommandInputIntegerSchema
  | AppCommandInputBooleanSchema
  | AppCommandInputArraySchema
