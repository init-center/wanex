import { collectDelegation } from "./collect.js"
import {
  delegationExecutorFromRuntimeHost,
  type DelegationExecutor
} from "./executor.js"
import { submitDelegation } from "./submit.js"
import type {
  DelegationPlan,
  DelegationRunOnceResult,
  DelegationSubmission,
  DelegationSummary,
  DelegationRuntimeOptions
} from "./types.js"
import { validatePlan } from "./validation.js"

export const WANEX_TEAM_DELEGATION = "wanex-team-delegation" as const

export class DelegationRuntime {
  private readonly executor: DelegationExecutor
  private readonly plans = new Map<string, DelegationPlan>()

  constructor(options: DelegationRuntimeOptions) {
    if (options.executor !== undefined) {
      this.executor = options.executor
      return
    }
    if (options.host !== undefined) {
      this.executor = delegationExecutorFromRuntimeHost(options.host)
      return
    }
    throw new Error("delegation runtime requires an executor or host")
  }

  registerPlan(plan: DelegationPlan): DelegationPlan {
    validatePlan(plan)
    this.plans.set(plan.id, plan)
    return plan
  }

  async submitDelegation(plan: DelegationPlan): Promise<DelegationSubmission> {
    this.registerPlan(plan)
    return await submitDelegation({ executor: this.executor, plan })
  }

  async runDelegationOnce(
    plan: DelegationPlan
  ): Promise<DelegationRunOnceResult> {
    const submitted = await this.submitDelegation(plan)
    const run = await this.executor.runOnce()
    const summary = await this.collectDelegation(plan.id)
    return {
      ...submitted,
      run,
      summary
    }
  }

  async collectDelegation(delegationId: string): Promise<DelegationSummary> {
    const plan = this.plans.get(delegationId)
    if (plan === undefined) {
      throw new Error(`delegation plan is not registered: ${delegationId}`)
    }
    return await collectDelegation({ executor: this.executor, plan })
  }
}
