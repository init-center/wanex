import type { CodingRepository } from "../host/types.js"
import type {
  CodingProjectReadModel,
  CodingProjectRecoveryReadModel
} from "./model.js"

export interface OpenCodingProject {
  readonly repository: CodingRepository
  readonly openedAt: number
}

export function projectCodingProject(
  project: OpenCodingProject
): CodingProjectReadModel {
  const recovery = projectRecovery(project.repository)
  return {
    projectId: project.repository.repositoryId,
    name: project.repository.repositoryName,
    state: recovery.transactionAttention || recovery.taskAttentionCount > 0 ||
        recovery.taskFailureCount > 0
      ? "attention"
      : "ready",
    openedAt: project.openedAt,
    recovery
  }
}

function projectRecovery(repository: CodingRepository): CodingProjectRecoveryReadModel {
  return {
    transactionAttention: repository.recovery.transaction === "attention",
    taskAttentionCount: repository.recovery.tasks.attention,
    taskFailureCount: repository.recovery.tasks.failed,
    moreTasksPending: repository.recovery.tasks.remaining
  }
}
