import type { PrincipalId } from "@wanex/protocol"
import type { WorkspaceIsolationRequest } from "../isolation/index.js"
import type { WorkspaceTaskRequest } from "./types.js"

export function isolationRequestForTask(
  request: WorkspaceTaskRequest,
  defaults: {
    readonly taskId: string
    readonly workspaceId: string
    readonly principalId: PrincipalId
  }
): WorkspaceIsolationRequest {
  const agentId = request.isolation?.agentId ?? request.agentId
  return {
    ...(request.isolation ?? {}),
    workspaceId: request.isolation?.workspaceId ?? defaults.workspaceId,
    jobId: request.isolation?.jobId ?? request.jobId ?? defaults.taskId,
    metadata: {
      ...(request.isolation?.metadata ?? {}),
      taskId: defaults.taskId,
      principalId: defaults.principalId
    },
    ...(agentId === undefined ? {} : { agentId })
  }
}
