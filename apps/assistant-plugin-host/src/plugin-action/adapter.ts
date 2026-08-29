import type { SubmitPluginActionRequest } from "@wanex/plugin"
import { requirePluginActionHandlerRef } from "./handler-ref.js"
import type {
  InvokePluginActionHandlerRequest,
  SubmitPluginActionPort
} from "./types.js"

export async function invokePluginActionHandler(
  port: SubmitPluginActionPort,
  request: InvokePluginActionHandlerRequest
) {
  const target = requirePluginActionHandlerRef(request.handlerRef)
  const requiredCapability =
    request.requiredCapability ?? target.requiredCapability
  if (
    request.requiredCapability !== undefined &&
    target.requiredCapability !== undefined &&
    request.requiredCapability !== target.requiredCapability
  ) {
    throw new Error(
      `plugin action capability mismatch: ${request.requiredCapability} != ${target.requiredCapability}`
    )
  }

  const submission: SubmitPluginActionRequest = {
    pluginId: target.pluginId,
    version: target.version,
    actionId: target.actionId,
    principalId: request.principalId,
    payload: request.payload,
    ...(requiredCapability === undefined ? {} : { requiredCapability }),
    ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    ...(request.jobIdempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: request.jobIdempotencyKey }),
    ...(request.scheduledAt === undefined
      ? {}
      : { scheduledAt: request.scheduledAt }),
    ...(request.notBefore === undefined
      ? {}
      : { notBefore: request.notBefore }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
    ...(request.maxAttempts === undefined
      ? {}
      : { maxAttempts: request.maxAttempts }),
    ...(request.retryPolicy === undefined
      ? {}
      : { retryPolicy: request.retryPolicy }),
    ...(request.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: request.budgetGrantId })
  }
  return await port.submitAction(submission)
}
