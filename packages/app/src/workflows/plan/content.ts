import type {
  JsonValue,
  MessagePart,
  PlanProposalContent,
  PlanProposalReference,
  PlanProposalStep
} from "@wanex/protocol"

const MAX_OUTPUT_BYTES = 256 * 1024
const MAX_TITLE_CHARS = 500
const MAX_SUMMARY_CHARS = 20_000
const MAX_STEP_TITLE_CHARS = 500
const MAX_STEP_DETAIL_CHARS = 20_000
const MAX_STEPS = 256
const MAX_REFERENCES = 256

export function parseGeneratedPlanContent(
  output: readonly MessagePart[],
  references: readonly PlanProposalReference[]
): PlanProposalContent {
  const unsupported = output.find(
    (part) => part.type !== "text" && part.type !== "reasoning"
  )
  if (unsupported !== undefined) {
    throw new Error(
      `plan generation returned unsupported ${unsupported.type} output`
    )
  }
  const text = output
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
  if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES) {
    throw new Error(`plan generation output exceeds ${MAX_OUTPUT_BYTES} bytes`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("plan generation output must be one JSON object")
  }
  if (!isRecord(value)) {
    throw new Error("plan generation output must be one JSON object")
  }
  assertExactKeys(value, ["title", "summary", "steps"], "plan output")
  if (!Array.isArray(value.steps)) {
    throw new Error("plan output steps must be an array")
  }
  const content = {
    title: requiredString(value.title, "plan output title"),
    summary: requiredString(value.summary, "plan output summary"),
    steps: value.steps.map(parseGeneratedStep),
    references: [...references]
  }
  assertPlanContent(content)
  return content
}

export function assertPlanContent(content: PlanProposalContent): void {
  assertBoundedText(content.title, "plan title", MAX_TITLE_CHARS)
  assertBoundedText(content.summary, "plan summary", MAX_SUMMARY_CHARS)
  if (content.steps.length === 0 || content.steps.length > MAX_STEPS) {
    throw new Error(`plan steps must contain 1..=${MAX_STEPS} entries`)
  }
  const stepIds = new Set<string>()
  for (const step of content.steps) {
    assertBoundedText(step.id, "plan step id", MAX_STEP_TITLE_CHARS)
    assertBoundedText(step.title, "plan step title", MAX_STEP_TITLE_CHARS)
    if (step.detail !== undefined) {
      assertBoundedText(
        step.detail,
        "plan step detail",
        MAX_STEP_DETAIL_CHARS
      )
    }
    if (stepIds.has(step.id)) {
      throw new Error(`duplicate plan step id: ${step.id}`)
    }
    stepIds.add(step.id)
  }
  if (content.references.length > MAX_REFERENCES) {
    throw new Error(`plan references exceed ${MAX_REFERENCES}`)
  }
  const referenceKeys = new Set<string>()
  for (const reference of content.references) {
    assertBoundedText(reference.id, "plan reference id", MAX_SUMMARY_CHARS)
    if (reference.role !== undefined) {
      assertBoundedText(reference.role, "plan reference role", MAX_TITLE_CHARS)
    }
    const key = `${reference.kind}\u0000${reference.id}\u0000${reference.role ?? ""}`
    if (referenceKeys.has(key)) {
      throw new Error("duplicate plan reference")
    }
    referenceKeys.add(key)
  }
}

export function planGenerationPrompt(): string {
  return [
    "Analyze the conversation and the planning request in read-only mode.",
    "Return exactly one JSON object with no Markdown or surrounding text.",
    'The object schema is {"title":string,"summary":string,"steps":[{"id":string,"title":string,"detail"?:string}]}.',
    "Use stable unique step ids. Include at least one concrete step.",
    "Do not claim that work has already been executed."
  ].join("\n")
}

export function planExecutionText(proposal: {
  readonly id: string
  readonly revision: number
  readonly title: string
  readonly summary: string
  readonly steps: readonly PlanProposalStep[]
}): string {
  const steps = proposal.steps
    .map(
      (step, index) =>
        `${index + 1}. [${step.id}] ${step.title}${
          step.detail === undefined ? "" : `\n   ${step.detail}`
        }`
    )
    .join("\n")
  return [
    `Execute approved plan ${proposal.id} revision ${proposal.revision}.`,
    `Title: ${proposal.title}`,
    `Summary: ${proposal.summary}`,
    "Steps:",
    steps
  ].join("\n\n")
}

function parseGeneratedStep(value: unknown, index: number): PlanProposalStep {
  if (!isRecord(value)) {
    throw new Error(`plan output step ${index} must be an object`)
  }
  assertExactKeys(value, ["id", "title", "detail"], `plan output step ${index}`)
  return {
    id: requiredString(value.id, `plan output step ${index} id`),
    title: requiredString(value.title, `plan output step ${index} title`),
    ...(value.detail === undefined
      ? {}
      : {
          detail: requiredString(
            value.detail,
            `plan output step ${index} detail`
          )
        })
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown !== undefined) {
    throw new Error(`${label} contains unknown field: ${unknown}`)
  }
  const required = allowed.filter((key) => key !== "detail")
  const missing = required.find((key) => !(key in value))
  if (missing !== undefined) {
    throw new Error(`${label} is missing field: ${missing}`)
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function assertBoundedText(
  value: string,
  label: string,
  maxChars: number
): void {
  if (value.trim().length === 0 || Array.from(value).length > maxChars) {
    throw new Error(`${label} must contain 1..=${maxChars} characters`)
  }
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
