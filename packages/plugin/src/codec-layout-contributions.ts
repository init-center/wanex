import type { JsonValue } from "@wanex/protocol"
import {
  expectJsonValue,
  expectRecord,
  expectString,
  rejectUnknownRecordKeys
} from "./internal-validation.js"
import type {
  PluginPackageCommandContribution,
  PluginPackageCommandPaletteVisibility,
  PluginPackageContributions
} from "./types-package.js"

const MAX_COMMANDS = 128
const MAX_ALIASES = 32
const MAX_IDENTITY_LENGTH = 128
const MAX_TITLE_LENGTH = 256
const MAX_DESCRIPTION_LENGTH = 4_096

const CONTRIBUTION_KEYS = new Set(["commands"])
const COMMAND_KEYS = new Set([
  "id",
  "name",
  "title",
  "description",
  "aliases",
  "category",
  "paletteVisibility",
  "actionId",
  "inputSchema"
])
const COMMAND_IDENTITY = /^[a-z0-9][a-z0-9._-]*$/u

export function expectPluginPackageContributions(
  value: JsonValue | undefined
): PluginPackageContributions {
  const record = expectRecord(value, "plugin package contributes")
  rejectUnknownRecordKeys(
    record,
    CONTRIBUTION_KEYS,
    "plugin package contributes"
  )
  return {
    ...(record.commands === undefined
      ? {}
      : { commands: expectPluginPackageCommands(record.commands) })
  }
}

function expectPluginPackageCommands(
  value: JsonValue
): PluginPackageCommandContribution[] {
  if (!Array.isArray(value)) {
    throw new Error("plugin package contributes.commands must be an array")
  }
  if (value.length > MAX_COMMANDS) {
    throw new Error(
      `plugin package contributes.commands exceeds ${MAX_COMMANDS} entries`
    )
  }
  return value.map((entry, index) => expectPluginPackageCommand(entry, index))
}

function expectPluginPackageCommand(
  value: JsonValue,
  index: number
): PluginPackageCommandContribution {
  const label = `plugin package contributes.commands[${index}]`
  const record = expectRecord(value, label)
  rejectUnknownRecordKeys(record, COMMAND_KEYS, label)
  const paletteVisibility = expectString(
    record.paletteVisibility,
    `${label}.paletteVisibility`
  )
  if (paletteVisibility !== "visible" && paletteVisibility !== "hidden") {
    throw new Error(`${label}.paletteVisibility must be visible or hidden`)
  }
  return {
    id: expectIdentity(record.id, `${label}.id`),
    name: expectIdentity(record.name, `${label}.name`),
    title: expectBoundedText(record.title, `${label}.title`, MAX_TITLE_LENGTH),
    ...(record.description === undefined
      ? {}
      : {
          description: expectBoundedText(
            record.description,
            `${label}.description`,
            MAX_DESCRIPTION_LENGTH
          )
        }),
    ...(record.aliases === undefined
      ? {}
      : { aliases: expectAliases(record.aliases, `${label}.aliases`) }),
    ...(record.category === undefined
      ? {}
      : { category: expectIdentity(record.category, `${label}.category`) }),
    paletteVisibility: paletteVisibility as PluginPackageCommandPaletteVisibility,
    actionId: expectIdentity(record.actionId, `${label}.actionId`),
    ...(record.inputSchema === undefined
      ? {}
      : {
          inputSchema: expectJsonValue(
            record.inputSchema,
            `${label}.inputSchema`
          )
        })
  }
}

function expectAliases(value: JsonValue, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  if (value.length > MAX_ALIASES) {
    throw new Error(`${label} exceeds ${MAX_ALIASES} entries`)
  }
  return value.map((entry, index) =>
    expectIdentity(entry, `${label}[${index}]`)
  )
}

function expectIdentity(value: JsonValue | undefined, label: string): string {
  const identity = expectString(value, label)
  if (
    identity.length > MAX_IDENTITY_LENGTH ||
    !COMMAND_IDENTITY.test(identity)
  ) {
    throw new Error(`${label} must be a bounded lowercase command identity`)
  }
  return identity
}

function expectBoundedText(
  value: JsonValue | undefined,
  label: string,
  maxLength: number
): string {
  const text = expectString(value, label)
  if (text !== text.trim() || text.length > maxLength) {
    throw new Error(`${label} must contain 1 to ${maxLength} trimmed characters`)
  }
  return text
}
