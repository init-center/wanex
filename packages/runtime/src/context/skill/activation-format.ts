import type {
  SkillActivationResult
} from "./types.js"

export function formatSkillActivationResult(
  result: SkillActivationResult
): string {
  return [
    `<skill_content name="${escapeXml(result.name)}">`,
    `# Skill: ${result.name}`,
    "",
    result.content.trim(),
    "",
    `Base directory for this skill: ${result.directory}`,
    "Relative paths in this skill are resolved from the base directory above.",
    "Supporting files are listed for discovery only; read them explicitly if needed.",
    "",
    "<skill_files>",
    ...result.supportingFiles.map((file) =>
      `  <file>${escapeXml(file.relativePath)}</file>`
    ),
    "</skill_files>",
    "</skill_content>"
  ].join("\n")
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;")
}
