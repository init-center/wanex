import type { DelegationPlan } from "./types.js"

export function validatePlan(plan: DelegationPlan): void {
  if (plan.id.length === 0) {
    throw new Error("delegation id must not be empty")
  }
  if (plan.tasks.length === 0) {
    throw new Error("delegation plan must include at least one task")
  }
  const seen = new Set<string>()
  for (const task of plan.tasks) {
    if (task.id.length === 0) {
      throw new Error("delegation task id must not be empty")
    }
    if (seen.has(task.id)) {
      throw new Error(`delegation task id must be unique: ${task.id}`)
    }
    seen.add(task.id)
    if (task.prompt.length === 0) {
      throw new Error(`delegation task prompt must not be empty: ${task.id}`)
    }
    if (task.maxSteps !== undefined && task.maxSteps <= 0) {
      throw new Error(`delegation task maxSteps must be positive: ${task.id}`)
    }
    if (task.providerProfileId !== undefined && task.providerProfileId.length === 0) {
      throw new Error(
        `delegation task providerProfileId must not be empty: ${task.id}`
      )
    }
  }
}
