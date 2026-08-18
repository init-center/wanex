import type {
  ModelCapabilityRequirement,
  ModelCapabilityRouteExecutionBinding,
  ModelEndpoint
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  createModelCapabilityRouteExecutionBinding,
  modelSupportsCapability,
  normalizeModelCapabilityRequirement
} from "@wanex/runtime/provider"
import {
  listWanexAppModelEndpointValues,
  projectModelEndpointReadModel
} from "./model-endpoint.js"
import type {
  WanexAppModelCapabilityReadinessReadModel,
  WanexAppModelCapabilityRoute,
  WanexAppModelCapabilityRouteListReadModel,
  WanexAppRoutableModelOperation
} from "./types-model-capability.js"
import {
  normalizeWanexAppRoutableOperation,
  readWanexAppModelCapabilityRouteMap,
  writeWanexAppModelCapabilityRouteMap
} from "./model-capability-config.js"
const MAX_READINESS_CANDIDATES = 64

export type WanexAppModelEndpointExecutionPredicate = (
  endpoint: ModelEndpoint
) => boolean

export type WanexAppModelCapabilityResolution =
  | {
      readonly kind: "resolved"
      readonly binding: ModelCapabilityRouteExecutionBinding
      readonly readiness: WanexAppModelCapabilityReadinessReadModel
    }
  | {
      readonly kind: "unresolved"
      readonly readiness: WanexAppModelCapabilityReadinessReadModel
    }

export async function listWanexAppModelCapabilityRoutes(
  storage: CoreStore
): Promise<WanexAppModelCapabilityRouteListReadModel> {
  const routes = await readWanexAppModelCapabilityRouteMap(storage)
  return {
    routes: Object.entries(routes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operation, modelEndpointId]) => ({
        operation: operation as WanexAppRoutableModelOperation,
        modelEndpointId
      }))
  }
}

export async function setWanexAppModelCapabilityRoute(options: {
  readonly storage: CoreStore
  readonly operation: WanexAppRoutableModelOperation
  readonly modelEndpointId: string
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
}): Promise<WanexAppModelCapabilityReadinessReadModel> {
  const operation = normalizeWanexAppRoutableOperation(options.operation)
  const endpointId = requireNonEmpty(
    options.modelEndpointId,
    "model capability route endpoint id"
  )
  const endpoints = await listWanexAppModelEndpointValues(options.storage)
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId)
  if (endpoint === undefined) {
    throw new Error(`model endpoint not found: ${endpointId}`)
  }
  if (!endpoint.model.operations.includes(operation)) {
    throw new Error(
      `model endpoint ${endpointId} does not support ${operation}`
    )
  }
  await writeWanexAppModelCapabilityRouteMap(options.storage, {
    ...(await readWanexAppModelCapabilityRouteMap(options.storage)),
    [operation]: endpointId
  })
  return (
    await resolveWanexAppModelCapability({
      storage: options.storage,
      requirement: requirementForOperation(operation),
      isModelEndpointExecutable: options.isModelEndpointExecutable
    })
  ).readiness
}

export async function clearWanexAppModelCapabilityRoute(options: {
  readonly storage: CoreStore
  readonly operation: WanexAppRoutableModelOperation
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
}): Promise<WanexAppModelCapabilityReadinessReadModel> {
  const operation = normalizeWanexAppRoutableOperation(options.operation)
  const routes = await readWanexAppModelCapabilityRouteMap(options.storage)
  delete routes[operation]
  await writeWanexAppModelCapabilityRouteMap(options.storage, routes)
  return (
    await resolveWanexAppModelCapability({
      storage: options.storage,
      requirement: requirementForOperation(operation),
      isModelEndpointExecutable: options.isModelEndpointExecutable
    })
  ).readiness
}

export async function resolveWanexAppModelCapability(options: {
  readonly storage: CoreStore
  readonly requirement: ModelCapabilityRequirement
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
}): Promise<WanexAppModelCapabilityResolution> {
  const requirement = normalizeRoutableRequirement(options.requirement)
  const [routeMap, endpoints] = await Promise.all([
    readWanexAppModelCapabilityRouteMap(options.storage),
    listWanexAppModelEndpointValues(options.storage)
  ])
  const eligible = endpoints
    .filter((endpoint) => modelSupportsCapability(endpoint.model, requirement))
    .sort(compareEndpointRecommendation)
  const executableEligible = eligible.filter((endpoint) =>
    options.isModelEndpointExecutable(endpoint)
  )
  const candidates = executableEligible
    .slice(0, MAX_READINESS_CANDIDATES)
    .map((endpoint) => projectModelEndpointReadModel(endpoint, null))
  const candidatesTruncated =
    executableEligible.length > MAX_READINESS_CANDIDATES
  const recommendedModelEndpointId = executableEligible[0]?.id
  const configuredId = routeMap[
    normalizeWanexAppRoutableOperation(requirement.operation)
  ]

  if (configuredId !== undefined) {
    const configured = endpoints.find((endpoint) => endpoint.id === configuredId)
    if (configured === undefined) {
      return unresolvedReadiness({
        requirement,
        status: "configured_endpoint_missing",
        reason: `configured model endpoint is missing: ${configuredId}`,
        candidates,
        candidatesTruncated,
        ...(recommendedModelEndpointId === undefined
          ? {}
          : { recommendedModelEndpointId })
      })
    }
    if (!modelSupportsCapability(configured.model, requirement)) {
      return unresolvedReadiness({
        requirement,
        status: "configured_endpoint_ineligible",
        reason: `configured model endpoint does not satisfy ${requirement.operation}: ${configuredId}`,
        candidates,
        candidatesTruncated,
        ...(recommendedModelEndpointId === undefined
          ? {}
          : { recommendedModelEndpointId })
      })
    }
    if (!options.isModelEndpointExecutable(configured)) {
      return unresolvedReadiness({
        requirement,
        status: "configured_endpoint_unavailable",
        reason: `configured model endpoint has no active executor: ${configuredId}`,
        candidates,
        candidatesTruncated,
        ...(recommendedModelEndpointId === undefined
          ? {}
          : { recommendedModelEndpointId })
      })
    }
    return resolvedReadiness({
      requirement,
      endpoint: configured,
      source: "configured",
      candidates,
      candidatesTruncated,
      ...(recommendedModelEndpointId === undefined
        ? {}
        : { recommendedModelEndpointId })
    })
  }

  if (executableEligible.length === 1) {
    return resolvedReadiness({
      requirement,
      endpoint: executableEligible[0]!,
      source: "single_candidate",
      candidates,
      candidatesTruncated,
      ...(recommendedModelEndpointId === undefined
        ? {}
        : { recommendedModelEndpointId })
    })
  }
  if (eligible.length === 0) {
    return unresolvedReadiness({
      requirement,
      status: "unconfigured",
      reason: `no model endpoint satisfies ${requirement.operation}`,
      candidates: [],
      candidatesTruncated: false
    })
  }
  if (executableEligible.length === 0) {
    return unresolvedReadiness({
      requirement,
      status: "executor_unavailable",
      reason: `no active executor is available for ${requirement.operation}`,
      candidates: [],
      candidatesTruncated: false
    })
  }
  return unresolvedReadiness({
    requirement,
    status: "selection_required",
    reason: `multiple model endpoints satisfy ${requirement.operation}`,
    candidates,
    candidatesTruncated,
    ...(recommendedModelEndpointId === undefined
      ? {}
      : { recommendedModelEndpointId })
  })
}

function resolvedReadiness(options: {
  readonly requirement: ModelCapabilityRequirement
  readonly endpoint: ModelEndpoint
  readonly source: "configured" | "single_candidate"
  readonly candidates: WanexAppModelCapabilityReadinessReadModel["candidates"]
  readonly candidatesTruncated: boolean
  readonly recommendedModelEndpointId?: string
}): WanexAppModelCapabilityResolution {
  const selectedEndpoint = projectModelEndpointReadModel(options.endpoint, null)
  return {
    kind: "resolved",
    binding: createModelCapabilityRouteExecutionBinding({
      requirement: options.requirement,
      source: options.source,
      modelEndpoint: options.endpoint
    }),
    readiness: {
      requirement: options.requirement,
      status: "ready",
      reason:
        options.source === "configured"
          ? "configured model capability route is ready"
          : "one eligible model endpoint was selected automatically",
      candidates: options.candidates,
      candidatesTruncated: options.candidatesTruncated,
      selectedEndpoint,
      selectedSource: options.source,
      ...(options.recommendedModelEndpointId === undefined
        ? {}
        : { recommendedModelEndpointId: options.recommendedModelEndpointId })
    }
  }
}

function unresolvedReadiness(
  readiness: WanexAppModelCapabilityReadinessReadModel
): WanexAppModelCapabilityResolution {
  return { kind: "unresolved", readiness }
}

function normalizeRoutableRequirement(
  requirement: ModelCapabilityRequirement
): ModelCapabilityRequirement {
  const normalized = normalizeModelCapabilityRequirement(requirement)
  normalizeWanexAppRoutableOperation(normalized.operation)
  return normalized
}

function requirementForOperation(
  operation: WanexAppRoutableModelOperation
): ModelCapabilityRequirement {
  return {
    operation,
    inputModalities: [],
    outputModalities: [],
    features: []
  }
}

function compareEndpointRecommendation(
  left: ModelEndpoint,
  right: ModelEndpoint
): number {
  const sourceRank = { provider: 0, builtin: 1, custom: 2 } as const
  return (
    sourceRank[left.model.catalog.source] -
      sourceRank[right.model.catalog.source] ||
    left.id.localeCompare(right.id)
  )
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.trim()
}
