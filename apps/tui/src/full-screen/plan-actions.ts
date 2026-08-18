import type { SelectListTheme } from "@earendil-works/pi-tui"
import type {
  PlanGenerationReadModel,
  PlanProposalReadModel
} from "@wanex/product"
import {
  TuiPlanReviewOverlay,
  type TuiPlanAction
} from "./components.js"

export interface TuiPlanReviewView {
  readonly loading?: boolean
  readonly generation: PlanGenerationReadModel | undefined
  readonly proposal: PlanProposalReadModel | undefined
  readonly actions: readonly {
    readonly value: TuiPlanAction
    readonly label: string
  }[]
}

export function createPlanReviewOverlay(options: {
  readonly loading?: boolean
  readonly generation: PlanGenerationReadModel | undefined
  readonly proposal: PlanProposalReadModel | undefined
  readonly actions: TuiPlanReviewView["actions"]
  readonly terminalRows: () => number
  readonly theme: SelectListTheme
  readonly onAction: (action: TuiPlanAction) => void
  readonly onCancel: () => void
}): TuiPlanReviewOverlay {
  return new TuiPlanReviewOverlay({
    ...(options.loading === undefined ? {} : { loading: options.loading }),
    ...(options.generation === undefined ? {} : { generation: options.generation }),
    ...(options.proposal === undefined ? {} : { proposal: options.proposal }),
    actions: options.actions,
    terminalRows: options.terminalRows,
    theme: options.theme,
    onAction: options.onAction,
    onCancel: options.onCancel
  })
}

export function planActions(
  generation: PlanGenerationReadModel | undefined,
  proposal: PlanProposalReadModel | undefined
): readonly { readonly value: TuiPlanAction; readonly label: string }[] {
  if (generation?.state === "running") {
    return [
      { value: "cancel-generation", label: "Cancel generation" },
      { value: "close", label: "Close" }
    ]
  }
  if (proposal?.state === "open") {
    return [
      { value: "approve", label: "Approve Plan" },
      { value: "reject", label: "Reject Plan" },
      { value: "withdraw", label: "Withdraw Plan" },
      { value: "edit", label: "Edit Plan" },
      ...(generation === undefined
        ? []
        : [{ value: "dismiss-generation" as const, label: "Dismiss generation" }]),
      { value: "start-generation", label: "Start new Plan" },
      { value: "close", label: "Close" }
    ]
  }
  if (proposal?.state === "approved" && proposal.execution === undefined) {
    return [
      { value: "execute", label: "Execute Plan" },
      ...(generation === undefined
        ? []
        : [{ value: "dismiss-generation" as const, label: "Dismiss generation" }]),
      { value: "start-generation", label: "Start new Plan" },
      { value: "close", label: "Close" }
    ]
  }
  if (generation !== undefined) {
    return [
      { value: "dismiss-generation", label: "Dismiss generation" },
      { value: "start-generation", label: "Start new Plan" },
      { value: "close", label: "Close" }
    ]
  }
  if (proposal !== undefined) {
    return [
      { value: "start-generation", label: "Start new Plan" },
      { value: "close", label: "Close" }
    ]
  }
  return [{ value: "close", label: "Close" }]
}

export function decisionLabel(decision: "approve" | "reject" | "withdraw"): string {
  return decision === "approve"
    ? "Approve"
    : decision === "reject"
      ? "Reject"
      : "Withdraw"
}

export function decisionPastTense(
  decision: "approve" | "reject" | "withdraw"
): string {
  return decision === "approve"
    ? "approved"
    : decision === "reject"
      ? "rejected"
      : "withdrawn"
}
