import type { JsonValue } from "@wanex/protocol"
import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  BaseRuntimeHostHealthSnapshot,
  BaseRuntimeHostLoopHealth
} from "./diagnostics-types.js"

export function runtimeHostHealthProjection(
  health: BaseRuntimeHostHealthSnapshot
): {
  readonly diagnostics: readonly AppDiagnosticEntry[]
  readonly activity: readonly AppActivityEntry[]
} {
  const hasStoppedLoops = health.started && health.stoppedLoopCount > 0
  const failureCount = health.loops.reduce(
    (total, loop) => total + loop.failedCount,
    0
  )
  const errorCount = health.loops.reduce(
    (total, loop) => total + loop.errorCount,
    0
  )
  const diagnostics: AppDiagnosticEntry[] = [
    {
      id: "runtime-host:health",
      source: "app",
      severity: hasStoppedLoops ? "warning" : "info",
      code: hasStoppedLoops
        ? "app.runtime_host.loop_stopped"
        : "app.runtime_host.health",
      message: hasStoppedLoops
        ? "Runtime host has stopped worker loops"
        : "Runtime host live health",
      at: health.generatedAt,
      detail: runtimeHostHealthDetail(health)
    }
  ]
  if (failureCount > 0 || errorCount > 0) {
    diagnostics.push({
      id: "runtime-host:loop-failures",
      source: "app",
      severity: "warning",
      code: "app.runtime_host.loop_failures",
      message: "Runtime host worker loops observed failed runs or loop errors",
      at: health.generatedAt,
      detail: {
        failureCount,
        errorCount,
        loops: health.loops
          .filter((loop) => loop.failedCount > 0 || loop.errorCount > 0)
          .map((loop) => runtimeHostLoopHealthDetail(loop))
      }
    })
  }
  return {
    diagnostics,
    activity: [
      {
        id: "runtime-host-activity:health",
        source: "app",
        severity: hasStoppedLoops || failureCount > 0 || errorCount > 0
          ? "warning"
          : "info",
        message: "Runtime host live health refreshed",
        at: health.generatedAt,
        detail: {
          started: health.started,
          loopCount: health.loopCount,
          activeLoopCount: health.activeLoopCount,
          stoppedLoopCount: health.stoppedLoopCount,
          runCount: health.loops.reduce(
            (total, loop) => total + loop.runCount,
            0
          ),
          failureCount,
          errorCount
        }
      }
    ]
  }
}

function runtimeHostHealthDetail(
  health: BaseRuntimeHostHealthSnapshot
): JsonValue {
  return {
    started: health.started,
    workerCount: health.workerCount,
    memoryWorkerCount: health.memoryWorkerCount,
    loopCount: health.loopCount,
    activeLoopCount: health.activeLoopCount,
    stoppedLoopCount: health.stoppedLoopCount,
    loops: health.loops.map((loop) => runtimeHostLoopHealthDetail(loop))
  }
}

function runtimeHostLoopHealthDetail(
  loop: BaseRuntimeHostLoopHealth
): JsonValue {
  return {
    id: loop.id,
    kind: loop.kind,
    index: loop.index,
    startedAt: loop.startedAt,
    stopped: loop.stopped,
    runCount: loop.runCount,
    idleCount: loop.idleCount,
    completedCount: loop.completedCount,
    failedCount: loop.failedCount,
    errorCount: loop.errorCount,
    ...(loop.lastResultStatus === undefined
      ? {}
      : { lastResultStatus: loop.lastResultStatus }),
    ...(loop.lastResultAt === undefined ? {} : { lastResultAt: loop.lastResultAt }),
    ...(loop.lastErrorAt === undefined ? {} : { lastErrorAt: loop.lastErrorAt })
  }
}
