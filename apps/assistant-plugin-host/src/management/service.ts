import {
  inspectLocalPluginPackage,
  installLocalPluginPackage,
  materializeLocalPluginPackage,
  pluginPackageTrustRecordFromJson,
  type PluginRuntime,
} from "@wanex/plugin"
import type { PluginInstallRecord } from "@wanex/protocol"
import type {
  ApproveLocalPluginReviewRequest,
  CancelLocalPluginReviewRequest,
  CancelLocalPluginReviewResult,
  PluginManagementEventListener,
  PluginManagementMutationResult,
  PluginManagementOperation,
  PluginManagementPort,
  PluginManagementSnapshot,
  RequestLocalPluginReviewResult,
  SetPluginInstallStateRequest,
} from "@wanex/assistant/plugin-management"
import type {
  AssistantPluginHostRefreshResult,
  AssistantPluginHostStatus,
} from "../types.js"
import { installError, mutationError, rejected } from "./errors.js"
import {
  resolvePluginCommandManagementOptions,
  type PluginCommandManagementOptions,
  type ResolvedPluginCommandManagementOptions,
} from "./options.js"
import { projectInstalledPluginVersions } from "./projection.js"
import { createPluginManagementSnapshot } from "./revision.js"
import { LocalPluginReviewRegistry } from "./reviews.js"

const MAX_MANAGED_INSTALLS = 999
const MAX_APPROVAL_REASON_LENGTH = 500
const MAX_ID_LENGTH = 256

export interface PluginCommandManagementDependencies {
  readonly runtime: PluginRuntime
  readonly refresh: () => Promise<AssistantPluginHostRefreshResult>
  readonly status: () => AssistantPluginHostStatus
}

export interface PluginCommandManagementController
  extends PluginManagementPort {
  dispose(): Promise<void>
}

export async function createPluginCommandManagement(
  dependencies: PluginCommandManagementDependencies,
  options: PluginCommandManagementOptions,
): Promise<PluginCommandManagementController> {
  const service = new PluginCommandManagementService(
    dependencies,
    resolvePluginCommandManagementOptions(options),
  )
  await service.initialize()
  return service
}

class PluginCommandManagementService
  implements PluginCommandManagementController {
  private readonly reviews: LocalPluginReviewRegistry
  private readonly listeners = new Set<PluginManagementEventListener>()
  private mutationTail: Promise<void> = Promise.resolve()
  private snapshot: PluginManagementSnapshot | undefined
  private sequence = 0
  private disposed = false

  constructor(
    private readonly dependencies: PluginCommandManagementDependencies,
    private readonly options: ResolvedPluginCommandManagementOptions,
  ) {
    this.reviews = new LocalPluginReviewRegistry(options)
  }

  async initialize(): Promise<void> {
    this.snapshot = await this.loadSnapshot()
  }

  async read(): Promise<PluginManagementSnapshot> {
    await this.mutationTail
    if (this.disposed) throw new Error("Plugin management is disposed.")
    const snapshot = await this.loadSnapshotSafe()
    this.snapshot = snapshot
    return snapshot
  }

  async requestLocalReview(): Promise<RequestLocalPluginReviewResult> {
    if (this.disposed) return rejected("disposed")
    if (!this.reviews.hasCapacity()) {
      return rejected("review_capacity_reached")
    }
    let sourceDir: string | undefined
    try {
      sourceDir = await this.options.selectLocalPackage()
    } catch {
      return rejected("selection_failed")
    }
    if (sourceDir === undefined) {
      return { kind: "plugin.management.review-cancelled" }
    }
    if (sourceDir.trim().length === 0) return rejected("selection_failed")
    let inspection
    try {
      inspection = await inspectLocalPluginPackage({
        sourceDir,
        ...(this.options.limits === undefined
          ? {}
          : { limits: this.options.limits }),
      })
    } catch {
      return rejected("inspection_failed")
    }
    return this.enqueue(async () => {
      if (this.disposed) return rejected("disposed")
      if (!this.reviews.hasCapacity()) {
        return rejected("review_capacity_reached")
      }
      try {
        return {
          kind: "plugin.management.review-ready",
          review: this.reviews.add(inspection),
        }
      } catch {
        return rejected("review_failed")
      }
    })
  }

  approveLocalReview(
    request: ApproveLocalPluginReviewRequest,
  ): Promise<PluginManagementMutationResult> {
    return this.enqueue(async () => {
      if (this.disposed) return rejected("disposed")
      const reviewId = boundedText(request.reviewId, MAX_ID_LENGTH)
      const reason = optionalBoundedText(
        request.reason,
        MAX_APPROVAL_REASON_LENGTH,
      )
      if (reviewId === undefined || reason === null) {
        return rejected("invalid_request")
      }
      const claimed = this.reviews.claim(reviewId)
      if (claimed.kind === "not_found") return rejected("review_not_found")
      if (claimed.kind === "expired") return rejected("review_expired")
      const { pending } = claimed
      let currentInspection
      try {
        currentInspection = await inspectLocalPluginPackage({
          sourceDir: pending.sourceDir,
          ...(this.options.limits === undefined
            ? {}
            : { limits: this.options.limits }),
        })
      } catch {
        return rejected("review_stale")
      }
      if (
        currentInspection.artifactSha256 !==
          pending.inspection.artifactSha256 ||
        currentInspection.layout.pluginId !== pending.inspection.layout.pluginId ||
        currentInspection.layout.version !== pending.inspection.layout.version
      ) {
        return rejected("review_stale")
      }

      try {
        const reviewedLayout = pending.inspection.layout
        const existing = await this.findInstall(
          reviewedLayout.pluginId,
          reviewedLayout.version,
        )
        if (existing === undefined) {
          await installLocalPluginPackage({
            runtime: this.dependencies.runtime,
            sourceDir: pending.sourceDir,
            installBaseDir: this.options.installBaseDir,
            expectedArtifactSha256: pending.inspection.artifactSha256,
            approval: {
              status: "allow",
              actorId: this.options.actorId,
              ...(reason === undefined ? {} : { reason }),
            },
            ...(this.options.limits === undefined
              ? {}
              : { limits: this.options.limits }),
            now: this.options.now,
          })
        } else {
          await this.restoreReviewedInstall(
            existing,
            pending.sourceDir,
            pending.inspection.artifactSha256,
          )
        }
      } catch (error) {
        return installError(error)
      }
      return await this.refreshAfterMutation("install")
    })
  }

  cancelLocalReview(
    request: CancelLocalPluginReviewRequest,
  ): Promise<CancelLocalPluginReviewResult> {
    return this.enqueue(async () => {
      if (this.disposed) return rejected("disposed")
      const reviewId = boundedText(request.reviewId, MAX_ID_LENGTH)
      if (reviewId === undefined) return rejected("invalid_request")
      const cancelled = this.reviews.cancel(reviewId)
      if (cancelled === "not_found") return rejected("review_not_found")
      if (cancelled === "expired") return rejected("review_expired")
      return { kind: "plugin.management.review-cancelled" }
    })
  }

  setInstallState(
    request: SetPluginInstallStateRequest,
  ): Promise<PluginManagementMutationResult> {
    return this.enqueue(async () => {
      if (this.disposed) return rejected("disposed")
      const pluginId = boundedText(request.pluginId, MAX_ID_LENGTH)
      const version = boundedText(request.version, MAX_ID_LENGTH)
      if (pluginId === undefined || version === undefined) {
        return rejected("invalid_request")
      }
      if (!ordinaryTransitionAllowed(request.expectedState, request.state)) {
        return rejected("state_transition_invalid")
      }
      try {
        await this.dependencies.runtime.updateInstallState({
          ...request,
          pluginId,
          version,
        })
      } catch (error) {
        return mutationError(error)
      }
      return await this.refreshAfterMutation("set_state")
    })
  }

  retryRefresh(): Promise<PluginManagementMutationResult> {
    return this.enqueue(async () => {
      if (this.disposed) return rejected("disposed")
      return await this.refreshAfterMutation("retry_refresh")
    })
  }

  subscribe(listener: PluginManagementEventListener): () => void {
    if (this.disposed) return () => undefined
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    await this.enqueue(async () => {
      if (this.disposed) return
      this.disposed = true
      this.reviews.clear()
      this.listeners.clear()
    })
  }

  private async restoreReviewedInstall(
    install: PluginInstallRecord,
    sourceDir: string,
    reviewedArtifactSha256: string,
  ): Promise<void> {
    let trust
    try {
      trust = pluginPackageTrustRecordFromJson(install.trust)
    } catch {
      throw new Error("existing install trust is invalid")
    }
    const expectedArtifact = trust.integrity?.sha256
    if (
      trust.source.kind !== "local" ||
      expectedArtifact === undefined ||
      expectedArtifact !== reviewedArtifactSha256
    ) {
      throw new Error("existing install does not match reviewed artifact")
    }
    const materialized = await materializeLocalPluginPackage({
      sourceDir,
      installBaseDir: this.options.installBaseDir,
      expectedArtifactSha256: expectedArtifact,
      ...(this.options.limits === undefined
        ? {}
        : { limits: this.options.limits }),
    })
    if (materialized.installRootDir !== install.installRootDir) {
      throw new Error("existing install root does not match reviewed artifact")
    }
    if (install.state !== "installed") {
      await this.dependencies.runtime.updateInstallState({
        pluginId: install.pluginId,
        version: install.version,
        expectedState: install.state,
        state: "installed",
      })
    }
  }

  private async findInstall(
    pluginId: string,
    version: string,
  ): Promise<PluginInstallRecord | undefined> {
    const installs = await this.dependencies.runtime.listInstalls({
      pluginId,
      limit: MAX_MANAGED_INSTALLS + 1,
    })
    if (installs.length > MAX_MANAGED_INSTALLS) {
      throw new Error("managed Plugin install limit exceeded")
    }
    return installs.find((install) => install.version === version)
  }

  private async refreshAfterMutation(
    operation: PluginManagementOperation,
  ): Promise<PluginManagementMutationResult> {
    const refresh = await this.dependencies.refresh()
    let snapshot: PluginManagementSnapshot
    try {
      snapshot = await this.loadSnapshot()
    } catch {
      return rejected("storage_failed")
    }
    this.publishIfChanged(snapshot)
    if (refresh.status === "failed") {
      return {
        kind: "plugin.management.attention-required",
        operation,
        snapshot,
        catalogRevision: refresh.revision,
        diagnostic: {
          code: refresh.diagnostic?.code ?? "refresh_failed",
          message: "Plugin command catalog refresh failed.",
        },
      }
    }
    return {
      kind: "plugin.management.applied",
      operation,
      snapshot,
      catalogRevision: refresh.revision,
    }
  }

  private async loadSnapshotSafe(): Promise<PluginManagementSnapshot> {
    try {
      return await this.loadSnapshot()
    } catch {
      throw new Error("Plugin management read failed.")
    }
  }

  private async loadSnapshot(): Promise<PluginManagementSnapshot> {
    const installs = await this.dependencies.runtime.listInstalls({
      limit: MAX_MANAGED_INSTALLS + 1,
    })
    if (installs.length > MAX_MANAGED_INSTALLS) {
      throw new Error("managed Plugin install limit exceeded")
    }
    return createPluginManagementSnapshot(
      projectInstalledPluginVersions(installs, this.dependencies.status()),
    )
  }

  private publishIfChanged(snapshot: PluginManagementSnapshot): void {
    const previous = this.snapshot
    this.snapshot = snapshot
    if (previous?.revision === snapshot.revision) return
    const event = {
      kind: "plugin.management.invalidated" as const,
      sequence: ++this.sequence,
      at: this.options.now(),
      revision: snapshot.revision,
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // One observer cannot prevent canonical state publication.
      }
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation)
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

function ordinaryTransitionAllowed(
  expected: SetPluginInstallStateRequest["expectedState"],
  state: SetPluginInstallStateRequest["state"],
): boolean {
  if (expected === "removed") return state === "removed"
  return true
}

function boundedText(value: string, maximum: number): string | undefined {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : undefined
}

function optionalBoundedText(
  value: string | undefined,
  maximum: number,
): string | undefined | null {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (normalized.length === 0) return undefined
  return normalized.length <= maximum ? normalized : null
}
