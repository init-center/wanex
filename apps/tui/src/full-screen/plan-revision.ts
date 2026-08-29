import type {
  EditorTheme,
  TUI
} from "@earendil-works/pi-tui"
import type {
  PlanProposalReadModel,
  RevisePlanProposalRequest
} from "@wanex/assistant"
import type { PlanProposalStep } from "@wanex/protocol"
import {
  TuiStructuredFormOverlay,
  type TuiStructuredFormField
} from "./structured-form.js"

export type PlanRevisionFieldName =
  | "title"
  | "summary"
  | `step-${number}-title`
  | `step-${number}-detail`

const MAX_PLAN_TITLE_CHARS = 500
const MAX_PLAN_SUMMARY_CHARS = 20_000
const MAX_PLAN_STEP_TITLE_CHARS = 500
const MAX_PLAN_STEP_DETAIL_CHARS = 20_000

export function createPlanRevisionForm(options: {
  readonly proposal: PlanProposalReadModel
  readonly tui: TUI
  readonly theme: EditorTheme
  readonly terminalRows: () => number
  readonly onCancel: () => void
  readonly onComplete: (
    values: Readonly<Record<PlanRevisionFieldName, string>>
  ) => void
}): TuiStructuredFormOverlay<PlanRevisionFieldName> {
  return new TuiStructuredFormOverlay({
    tui: options.tui,
    theme: options.theme,
    title: "Edit Plan",
    fields: planRevisionFields(options.proposal),
    terminalRows: options.terminalRows,
    onCancel: options.onCancel,
    onComplete: options.onComplete
  })
}

export function buildPlanRevisionRequest(
  proposal: PlanProposalReadModel,
  values: Readonly<Record<PlanRevisionFieldName, string>>
): RevisePlanProposalRequest {
  const title = requiredValue(values.title, "Plan title")
  const summary = requiredValue(values.summary, "Plan summary")
  const steps: PlanProposalStep[] = proposal.steps.map((step, index) => {
    const stepTitle = requiredValue(
      values[`step-${index}-title`],
      `Step ${index + 1} title`
    )
    const detail = values[`step-${index}-detail`]?.trim() ?? ""
    const { detail: _existingDetail, ...stepWithoutDetail } = step
    return detail.length === 0
      ? { ...stepWithoutDetail, title: stepTitle }
      : { ...step, title: stepTitle, detail }
  })
  return {
    proposalId: proposal.proposalId,
    expectedRevision: proposal.revision,
    title,
    summary,
    steps
  }
}

function planRevisionFields(
  proposal: PlanProposalReadModel
): readonly TuiStructuredFormField<PlanRevisionFieldName>[] {
  const fields: TuiStructuredFormField<PlanRevisionFieldName>[] = [
    {
      name: "title",
      label: "Plan title",
      description: "Name the outcome this Plan proposes.",
      initialValue: proposal.title,
      validate: boundedRequired("Plan title", MAX_PLAN_TITLE_CHARS)
    },
    {
      name: "summary",
      label: "Plan summary",
      description: "Explain the intended result before the individual steps.",
      initialValue: proposal.summary,
      validate: boundedRequired("Plan summary", MAX_PLAN_SUMMARY_CHARS)
    }
  ]
  for (const [index, step] of proposal.steps.entries()) {
    fields.push({
      name: `step-${index}-title`,
      label: `Step ${index + 1} title`,
      description: "Keep this step concrete and independently understandable.",
      initialValue: step.title,
      validate: boundedRequired(
        `Step ${index + 1} title`,
        MAX_PLAN_STEP_TITLE_CHARS
      )
    })
    fields.push({
      name: `step-${index}-detail`,
      label: `Step ${index + 1} detail`,
      description: "Optional detail. Leave empty to remove the existing detail.",
      initialValue: step.detail ?? "",
      validate: boundedOptional(
        `Step ${index + 1} detail`,
        MAX_PLAN_STEP_DETAIL_CHARS
      )
    })
  }
  return fields
}

function boundedRequired(
  label: string,
  maxCharacters: number
): (value: string) => string | undefined {
  return (value) => {
    const normalized = value.trim()
    if (normalized.length === 0) return `${label} is required`
    if (Array.from(normalized).length > maxCharacters) {
      return `${label} must not exceed ${maxCharacters} characters`
    }
    return undefined
  }
}

function boundedOptional(
  label: string,
  maxCharacters: number
): (value: string) => string | undefined {
  return (value) =>
    Array.from(value.trim()).length > maxCharacters
      ? `${label} must not exceed ${maxCharacters} characters`
      : undefined
}

function requiredValue(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? ""
  if (normalized.length === 0) throw new Error(`${label} is required`)
  return normalized
}
