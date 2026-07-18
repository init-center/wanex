import { parse } from "yaml"
import type { ParseSkillMarkdownOptions, ParsedSkillMarkdown } from "./types.js"

const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 1024
const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/u

export function parseSkillMarkdown(
  options: ParseSkillMarkdownOptions
): ParsedSkillMarkdown {
  const match = options.content.match(FRONTMATTER_PATTERN)
  if (match === null) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} must start with YAML frontmatter containing name and description.`
    )
  }

  let raw: unknown
  try {
    raw = parse(match[1] ?? "")
  } catch (error) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} has invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!isRecord(raw)) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} frontmatter must be a YAML mapping.`
    )
  }

  const name = requireString(raw.name, options.path, "name")
  validateSkillName(name, options)
  const description = requireString(raw.description, options.path, "description")
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`
    )
  }

  return {
    name,
    description,
    body: (match[2] ?? "").trim(),
    ...optionalAllowedTools(raw, options.path),
    ...optionalMetadata(raw, options.path)
  }
}

export class SkillFrontmatterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillFrontmatterError"
  }
}

function validateSkillName(
  name: string,
  options: ParseSkillMarkdownOptions
): void {
  if (name.length > MAX_NAME_LENGTH) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} name must be at most ${MAX_NAME_LENGTH} characters.`
    )
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} name must use lowercase kebab-case.`
    )
  }
  if (name !== options.directoryName) {
    throw new SkillFrontmatterError(
      `Skill ${options.path} declares name "${name}" but directory is "${options.directoryName}".`
    )
  }
}

function requireString(value: unknown, path: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SkillFrontmatterError(
      `Skill ${path} must define frontmatter ${field} as a non-empty string.`
    )
  }
  return value.trim()
}

function optionalAllowedTools(
  raw: Readonly<Record<string, unknown>>,
  path: string
): { readonly allowedTools?: readonly string[] } {
  const value = raw["allowed-tools"] ?? raw.allowedTools
  if (value === undefined || value === null) {
    return {}
  }
  if (typeof value === "string") {
    const tools = value.trim().split(/\s+/u).filter(Boolean)
    return tools.length === 0 ? {} : { allowedTools: tools }
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.length === 0 ? {} : { allowedTools: value.map((item) => item.trim()).filter(Boolean) }
  }
  throw new SkillFrontmatterError(
    `Skill ${path} frontmatter allowed-tools must be a string or string array.`
  )
}

function optionalMetadata(
  raw: Readonly<Record<string, unknown>>,
  path: string
): { readonly metadata?: Readonly<Record<string, string>> } {
  const value = raw.metadata
  if (value === undefined || value === null) {
    return {}
  }
  if (!isRecord(value)) {
    throw new SkillFrontmatterError(
      `Skill ${path} frontmatter metadata must be a string-to-string mapping.`
    )
  }
  const metadata: Record<string, string> = {}
  for (const [key, metadataValue] of Object.entries(value)) {
    if (typeof metadataValue !== "string") {
      throw new SkillFrontmatterError(
        `Skill ${path} frontmatter metadata must be a string-to-string mapping.`
      )
    }
    metadata[key] = metadataValue
  }
  return Object.keys(metadata).length === 0 ? {} : { metadata }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
