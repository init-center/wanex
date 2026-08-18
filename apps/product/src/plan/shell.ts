import type { BackendShell } from "@wanex/product/backend"
import { createPlanGenerationCoordinator } from "./generation.js"
import {
  clearPlanProposalSelection,
  decidePlanProposal,
  executePlanProposal,
  listPlanProposals,
  readPlanProposal,
  revisePlanProposal,
  selectPlanProposal
} from "./review.js"
import {
  selectedSessionId,
  type StateCoordinator
} from "../state/product.js"
import type { Shell } from "../model.js"

type PlanShellCommands = Pick<
  Shell,
  | "startPlanGeneration"
  | "readPlanGeneration"
  | "cancelPlanGeneration"
  | "dismissPlanGeneration"
  | "selectPlanProposal"
  | "clearPlanProposalSelection"
  | "readPlanProposal"
  | "listPlanProposals"
  | "revisePlanProposal"
  | "decidePlanProposal"
  | "executePlanProposal"
>

export interface PlanShell {
  readonly events: Shell["planEvents"]
  readonly commands: PlanShellCommands
  dispose(): Promise<void>
}

export function createPlanShell(options: {
  readonly backend: BackendShell
  readonly state: StateCoordinator
}): PlanShell {
  const generations = createPlanGenerationCoordinator(options)

  return {
    events: generations.events,
    commands: {
      async startPlanGeneration(request) {
        return await generations.start(request)
      },
      readPlanGeneration(request) {
        return generations.read(request)
      },
      async cancelPlanGeneration(request) {
        return await generations.cancel(request)
      },
      async dismissPlanGeneration(request) {
        return await generations.dismiss(request)
      },
      async selectPlanProposal(request) {
        const snapshot = await selectPlanProposal({
          ...options,
          input: request
        })
        generations.invalidate({
          cause: "selection_changed",
          ...(snapshot.selection?.kind !== "session"
            ? {}
            : { sessionId: snapshot.selection.sessionId }),
          proposalId: request.proposalId
        })
        return snapshot
      },
      async clearPlanProposalSelection() {
        const proposalId = options.state.state.selectedPlanProposalId
        const snapshot = await clearPlanProposalSelection(
          options.state
        )
        generations.invalidate({
          cause: "selection_changed",
          ...(snapshot.selection?.kind !== "session"
            ? {}
            : { sessionId: snapshot.selection.sessionId }),
          ...(proposalId === undefined ? {} : { proposalId })
        })
        return snapshot
      },
      async readPlanProposal(request) {
        return await readPlanProposal({
          ...options,
          ...(request === undefined ? {} : { input: request })
        })
      },
      async listPlanProposals(request) {
        return await listPlanProposals({
          ...options,
          ...(request === undefined ? {} : { input: request })
        })
      },
      async revisePlanProposal(request) {
        const result = await revisePlanProposal({
          ...options,
          input: request
        })
        invalidateProposalChange(generations, options.state, result)
        return result
      },
      async decidePlanProposal(request) {
        const result = await decidePlanProposal({
          ...options,
          input: request
        })
        invalidateProposalChange(generations, options.state, result)
        return result
      },
      async executePlanProposal(request) {
        const result = await executePlanProposal({
          ...options,
          input: request
        })
        generations.invalidate({
          cause: "execution_submitted",
          sessionId: result.proposal.source.sessionId,
          proposalId: result.proposal.proposalId
        })
        return result
      }
    },
    async dispose() {
      await generations.dispose()
    }
  }
}

function invalidateProposalChange(
  generations: ReturnType<typeof createPlanGenerationCoordinator>,
  state: StateCoordinator,
  result: Awaited<ReturnType<typeof revisePlanProposal>>
): void {
  const sessionId = selectedSessionId(state.state)
  generations.invalidate({
    cause: "proposal_changed",
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(result.kind === "product.plan-proposal.found"
      ? { proposalId: result.proposal.proposalId }
      : {})
  })
}
