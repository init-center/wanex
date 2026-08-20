import type { PrincipalId } from "@wanex/protocol"
import type { WorkspaceIsolationRequest } from "../isolation/index.js"
import type { WorkspaceTaskRequest } from "./types.js"

export function isolationRequestForTask(
  request: WorkspaceTaskRequest,
  defaults: {
    readonly taskId: string
    readonly isolationId: string
    readonly workspaceId: string
    readonly principalId: PrincipalId
  }
): WorkspaceIsolationRequest {
  return {
    isolationId: defaults.isolationId,
    workspaceId: defaults.workspaceId,
    jobId: request.jobId ?? defaults.taskId,
    ...(request.agentId === undefined ? {} : { agentId: request.agentId })
  }
}
