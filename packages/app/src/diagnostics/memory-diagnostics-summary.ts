export interface MemoryMaintenanceDiagnosticsSummary {
  readonly scannedSessionCount: number
  readonly activeEpochCount: number
  readonly noActiveEpochSessionCount: number
  readonly pendingJobCount: number
  readonly runningJobCount: number
  readonly failedJobCount: number
  readonly staleEpochCount: number
}

export interface MutableMemoryMaintenanceDiagnosticsSummary {
  scannedSessionCount: number
  activeEpochCount: number
  noActiveEpochSessionCount: number
  pendingJobCount: number
  runningJobCount: number
  failedJobCount: number
  staleEpochCount: number
}

export function buildEmptyMemoryMaintenanceSummary(
  scannedSessionCount: number
): MutableMemoryMaintenanceDiagnosticsSummary {
  return {
    scannedSessionCount,
    activeEpochCount: 0,
    noActiveEpochSessionCount: 0,
    pendingJobCount: 0,
    runningJobCount: 0,
    failedJobCount: 0,
    staleEpochCount: 0
  }
}
