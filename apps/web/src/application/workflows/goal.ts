import type { SurfaceClient } from "@wanex/product/surface"
import type {
  GoalSourceResult,
  GoalViewModel
} from "../model.js"

export function idleGoal(): GoalViewModel {
  return {
    kind: "web.goal",
    state: "no-session",
    message: "Select a Session to use Goal Mode"
  }
}

export function projectGoalFromResult(
  result: GoalSourceResult,
  previous: GoalViewModel
): GoalViewModel {
  if (result.kind === "product.goal") {
    return {
      kind: "web.goal",
      state: result.state,
      sessionId: result.sessionId,
      goal: result
    }
  }
  if (result.kind === "product.goal.found") {
    return projectGoalFromResult(result.goal, previous)
  }
  if (result.kind === "product.goal.no-session") {
    return idleGoal()
  }
  return {
    kind: "web.goal",
    state: "missing",
    ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
    message: "No Goal has been started for this Session"
  }
}

export async function reconcileGoal(request: {
  readonly client: SurfaceClient
  readonly previous: GoalViewModel
  readonly sessionId?: string
}): Promise<GoalViewModel> {
  const response = await request.client.readGoal(
    request.sessionId === undefined
      ? undefined
      : { sessionId: request.sessionId }
  )
  return response.ok
    ? projectGoalFromResult(response.value, request.previous)
    : {
        ...request.previous,
        state: "unavailable",
        message: response.error.message
      }
}
