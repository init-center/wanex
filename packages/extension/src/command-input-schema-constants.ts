import type { AppCommandInputSchemaLimits } from "./command-input-schema-types.js"

export const DEFAULT_APP_COMMAND_INPUT_SCHEMA_LIMITS: AppCommandInputSchemaLimits =
  Object.freeze({
    maxSerializedBytes: 64 * 1024,
    maxSchemaDepth: 8,
    maxSchemaNodes: 256,
    maxProperties: 128,
    maxPropertyNameLength: 128,
    maxTitleLength: 256,
    maxDescriptionLength: 4_096,
    maxEnumValuesPerNode: 100,
    maxEnumValuesTotal: 256,
    maxRequiredNames: 128,
    maxStringLengthBound: 65_536,
    maxCollectionBound: 256,
    maxValueDepth: 8,
    maxValueNodes: 1_024
  })

export const APP_COMMAND_INPUT_SCHEMA_TYPES = [
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array"
] as const
