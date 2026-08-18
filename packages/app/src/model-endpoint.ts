import {
  assertConversationModelSupported,
  modelEndpointFromJson,
  modelEndpointConfigKey,
  modelEndpointToJson,
  normalizeModelEndpoint,
  readModelEndpoint,
} from "@wanex/runtime/provider";
import type {
  JsonValue,
  ModelEndpoint,
  ProviderConnection,
} from "@wanex/protocol";
import type { CoreStore } from "@wanex/storage";
import type {
  WanexAppModelEndpointListReadModel,
  WanexAppModelEndpointReadModel,
  WanexAppRemoveModelEndpointConnectionResult,
} from "./types-model-endpoint.js";
import {
  APP_MODEL_CAPABILITY_ROUTES_KEY,
  readWanexAppModelCapabilityRouteMap,
  wanexAppModelCapabilityRouteMapToJson,
} from "./model-capability-config.js";

export const APP_ACTIVE_MODEL_ENDPOINT_KEY =
  "wanex-app.modelEndpoint.activeEndpointId";
export const APP_MODEL_ENDPOINT_INDEX_KEY =
  "wanex-app.modelEndpoint.endpointIndex";

export async function upsertWanexAppModelEndpoint(options: {
  readonly storage: CoreStore;
  readonly modelEndpoint: ModelEndpoint;
  readonly makeActive?: boolean;
}): Promise<WanexAppModelEndpointReadModel> {
  const [endpoint] = await upsertWanexAppModelEndpointSet({
    storage: options.storage,
    modelEndpoints: [options.modelEndpoint],
    ...(options.makeActive === true
      ? { makeActiveEndpointId: options.modelEndpoint.id }
      : {}),
    activateByDefault: options.makeActive !== false,
  });
  if (endpoint === undefined) throw new Error("model endpoint write disappeared");
  return endpoint;
}

export async function replaceWanexAppConnectedModelEndpoints(options: {
  readonly storage: CoreStore;
  readonly connection: ProviderConnection;
  readonly endpoints: readonly Omit<ModelEndpoint, "connection">[];
  readonly makeActiveEndpointId?: string;
  readonly activateByDefault?: boolean;
}): Promise<readonly WanexAppModelEndpointReadModel[]> {
  const outcome = await applyWanexAppModelEndpointConnectionMutation({
    storage: options.storage,
    connectionId: options.connection.id,
    replacements: options.endpoints.map((endpoint) => ({
      ...endpoint,
      connection: options.connection,
    })),
    ...(options.makeActiveEndpointId === undefined
      ? {}
      : { makeActiveEndpointId: options.makeActiveEndpointId }),
    ...(options.activateByDefault === undefined
      ? {}
      : { activateByDefault: options.activateByDefault }),
  });
  return outcome.replacements;
}

export async function removeWanexAppModelEndpointConnection(options: {
  readonly storage: CoreStore;
  readonly connectionId: string;
}): Promise<WanexAppRemoveModelEndpointConnectionResult> {
  const outcome = await applyWanexAppModelEndpointConnectionMutation({
    storage: options.storage,
    connectionId: options.connectionId,
    replacements: [],
  });
  return {
    connectionId: options.connectionId,
    removedEndpointIds: outcome.removedEndpointIds,
    ...(outcome.activeEndpointId === null
      ? {}
      : { activeEndpointId: outcome.activeEndpointId }),
  };
}

export async function upsertWanexAppSiblingModelEndpoint(options: {
  readonly storage: CoreStore;
  readonly sourceEndpointId: string;
  readonly endpoint: Omit<ModelEndpoint, "connection">;
  readonly makeActive?: boolean;
}): Promise<WanexAppModelEndpointReadModel> {
  const source = await readModelEndpoint(
    options.storage,
    options.sourceEndpointId,
  );
  if (source === null) {
    throw new Error(
      `source model endpoint not found: ${options.sourceEndpointId}`,
    );
  }
  if (source.connection.secretRef === undefined) {
    throw new Error(
      `source model endpoint has no configured credential: ${options.sourceEndpointId}`,
    );
  }
  return await upsertWanexAppModelEndpoint({
    storage: options.storage,
    modelEndpoint: {
      ...options.endpoint,
      connection: source.connection,
    },
    ...(options.makeActive === undefined
      ? {}
      : { makeActive: options.makeActive }),
  });
}

export async function setWanexAppActiveModelEndpoint(options: {
  readonly storage: CoreStore;
  readonly endpointId: string;
}): Promise<WanexAppModelEndpointReadModel> {
  const endpoint = await readModelEndpoint(options.storage, options.endpointId);
  if (endpoint === null) {
    throw new Error(`model endpoint not found: ${options.endpointId}`);
  }
  assertConversationEndpoint(endpoint);
  await options.storage.applyConfigMutations({
    puts: [
      { key: APP_ACTIVE_MODEL_ENDPOINT_KEY, value: options.endpointId },
      {
        key: APP_MODEL_ENDPOINT_INDEX_KEY,
        value: addEndpointId(
          await readModelEndpointIndex(options.storage),
          options.endpointId,
        ) as JsonValue,
      },
    ],
    deletes: [],
  });
  return projectModelEndpointReadModel(endpoint, options.endpointId);
}

async function upsertWanexAppModelEndpointSet(options: {
  readonly storage: CoreStore;
  readonly modelEndpoints: readonly ModelEndpoint[];
  readonly makeActiveEndpointId?: string;
  readonly activateByDefault?: boolean;
}): Promise<readonly WanexAppModelEndpointReadModel[]> {
  if (options.modelEndpoints.length === 0 || options.modelEndpoints.length > 16) {
    throw new Error("model endpoint set must contain 1 to 16 endpoints");
  }
  const endpoints = options.modelEndpoints.map(normalizeModelEndpoint);
  const endpointIds = endpoints.map((endpoint) => endpoint.id);
  if (new Set(endpointIds).size !== endpointIds.length) {
    throw new Error("model endpoint set IDs must be unique");
  }

  const currentActiveEndpointId = await readActiveModelEndpointId(options.storage);
  const explicitActiveEndpointId = options.makeActiveEndpointId;
  if (
    explicitActiveEndpointId !== undefined &&
    !endpointIds.includes(explicitActiveEndpointId)
  ) {
    throw new Error("active model endpoint must belong to the endpoint set");
  }
  const replacementForCurrentActive = endpoints.find(
    (endpoint) => endpoint.id === currentActiveEndpointId,
  );
  if (replacementForCurrentActive !== undefined) {
    assertConversationEndpoint(replacementForCurrentActive);
  }
  const explicitActive = endpoints.find(
    (endpoint) => endpoint.id === explicitActiveEndpointId,
  );
  if (explicitActive !== undefined) assertConversationEndpoint(explicitActive);

  const defaultActive =
    explicitActiveEndpointId === undefined &&
    options.activateByDefault !== false &&
    currentActiveEndpointId === null
      ? endpoints.find(supportsConversation)?.id
      : undefined;
  const activeEndpointId =
    explicitActiveEndpointId ?? defaultActive ?? currentActiveEndpointId;
  const index = addEndpointIds(
    await readModelEndpointIndex(options.storage),
    endpointIds,
  );
  await options.storage.applyConfigMutations({
    puts: [
      ...endpoints.map((endpoint) => ({
        key: modelEndpointConfigKey(endpoint.id),
        value: modelEndpointToJson(endpoint),
      })),
      { key: APP_MODEL_ENDPOINT_INDEX_KEY, value: index as JsonValue },
      ...(activeEndpointId === null
        ? []
        : [{ key: APP_ACTIVE_MODEL_ENDPOINT_KEY, value: activeEndpointId }]),
    ],
    deletes: [],
  });
  return endpoints.map((endpoint) =>
    projectModelEndpointReadModel(endpoint, activeEndpointId),
  );
}

async function applyWanexAppModelEndpointConnectionMutation(options: {
  readonly storage: CoreStore;
  readonly connectionId: string;
  readonly replacements: readonly ModelEndpoint[];
  readonly makeActiveEndpointId?: string;
  readonly activateByDefault?: boolean;
}): Promise<{
  readonly replacements: readonly WanexAppModelEndpointReadModel[];
  readonly removedEndpointIds: readonly string[];
  readonly activeEndpointId: string | null;
}> {
  if (options.connectionId.trim().length === 0) {
    throw new Error("model endpoint connection id must not be empty");
  }
  if (options.replacements.length > 16) {
    throw new Error("model endpoint connection must contain at most 16 endpoints");
  }
  const replacements = options.replacements.map(normalizeModelEndpoint);
  if (replacements.some(
    (endpoint) => endpoint.connection.id !== options.connectionId,
  )) {
    throw new Error("replacement endpoints must share the target connection");
  }
  const replacementIds = replacements.map((endpoint) => endpoint.id);
  if (new Set(replacementIds).size !== replacementIds.length) {
    throw new Error("model endpoint set IDs must be unique");
  }
  if (
    options.makeActiveEndpointId !== undefined &&
    !replacementIds.includes(options.makeActiveEndpointId)
  ) {
    throw new Error("active model endpoint must belong to the endpoint set");
  }
  const explicitActive = replacements.find(
    (endpoint) => endpoint.id === options.makeActiveEndpointId,
  );
  if (explicitActive !== undefined) assertConversationEndpoint(explicitActive);

  const [currentIndex, currentActiveEndpointId, currentRoutes] =
    await Promise.all([
      readModelEndpointIndex(options.storage),
      readActiveModelEndpointId(options.storage),
      readWanexAppModelCapabilityRouteMap(options.storage),
    ]);
  const currentEndpoints = (
    await Promise.all(
      currentIndex.map((endpointId) => readModelEndpoint(options.storage, endpointId)),
    )
  ).filter((endpoint): endpoint is ModelEndpoint => endpoint !== null);
  for (const replacement of replacements) {
    const collision = currentEndpoints.find(
      (endpoint) =>
        endpoint.id === replacement.id &&
        endpoint.connection.id !== options.connectionId,
    );
    if (collision !== undefined) {
      throw new Error(
        `model endpoint belongs to another connection: ${replacement.id}`,
      );
    }
  }

  const removed = currentEndpoints.filter(
    (endpoint) =>
      endpoint.connection.id === options.connectionId &&
      !replacementIds.includes(endpoint.id),
  );
  const retained = currentEndpoints.filter(
    (endpoint) => endpoint.connection.id !== options.connectionId,
  );
  const finalEndpoints = [...retained, ...replacements].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const currentActiveStillValid = finalEndpoints.find(
    (endpoint) =>
      endpoint.id === currentActiveEndpointId && supportsConversation(endpoint),
  );
  const shouldSelectDefault =
    options.makeActiveEndpointId !== undefined ||
    currentActiveEndpointId !== null ||
    options.activateByDefault !== false;
  const activeEndpointId =
    options.makeActiveEndpointId ??
    currentActiveStillValid?.id ??
    (shouldSelectDefault
      ? finalEndpoints.find(supportsConversation)?.id ?? null
      : null);
  const validRoutes = Object.fromEntries(
    Object.entries(currentRoutes).filter(([operation, endpointId]) => {
      const endpoint = finalEndpoints.find((candidate) => candidate.id === endpointId);
      return endpoint?.model.operations.some(
        (candidate) => candidate === operation,
      ) === true;
    }),
  );
  const removedEndpointIds = removed.map((endpoint) => endpoint.id).sort();
  await options.storage.applyConfigMutations({
    puts: [
      ...replacements.map((endpoint) => ({
        key: modelEndpointConfigKey(endpoint.id),
        value: modelEndpointToJson(endpoint),
      })),
      {
        key: APP_MODEL_ENDPOINT_INDEX_KEY,
        value: finalEndpoints.map((endpoint) => endpoint.id) as JsonValue,
      },
      {
        key: APP_MODEL_CAPABILITY_ROUTES_KEY,
        value: wanexAppModelCapabilityRouteMapToJson(validRoutes),
      },
      ...(activeEndpointId === null
        ? []
        : [{ key: APP_ACTIVE_MODEL_ENDPOINT_KEY, value: activeEndpointId }]),
    ],
    deletes: [
      ...removedEndpointIds.map(modelEndpointConfigKey),
      ...(activeEndpointId === null ? [APP_ACTIVE_MODEL_ENDPOINT_KEY] : []),
    ],
  });
  return {
    replacements: replacements.map((endpoint) =>
      projectModelEndpointReadModel(endpoint, activeEndpointId),
    ),
    removedEndpointIds,
    activeEndpointId,
  };
}

function assertConversationEndpoint(endpoint: ModelEndpoint): void {
  assertConversationModelSupported(endpoint.protocol.id, endpoint.model);
}

function supportsConversation(endpoint: ModelEndpoint): boolean {
  try {
    assertConversationEndpoint(endpoint);
    return true;
  } catch {
    return false;
  }
}

export async function readWanexAppActiveModelEndpoint(
  storage: CoreStore,
): Promise<WanexAppModelEndpointReadModel | null> {
  const activeEndpointId = await readActiveModelEndpointId(storage);
  if (activeEndpointId === null) {
    return null;
  }
  const endpoint = await readModelEndpoint(storage, activeEndpointId);
  if (endpoint === null) {
    throw new Error(`model endpoint not found: ${activeEndpointId}`);
  }
  return projectModelEndpointReadModel(endpoint, activeEndpointId);
}

export async function readWanexAppModelEndpoint(options: {
  readonly storage: CoreStore;
  readonly endpointId: string;
}): Promise<WanexAppModelEndpointReadModel | null> {
  const endpoint = await readModelEndpoint(options.storage, options.endpointId);
  if (endpoint === null) {
    return null;
  }
  return projectModelEndpointReadModel(
    endpoint,
    await readActiveModelEndpointId(options.storage),
  );
}

export async function listWanexAppModelEndpoints(
  storage: CoreStore,
): Promise<WanexAppModelEndpointListReadModel> {
  const activeEndpointId = await readActiveModelEndpointId(storage);
  const endpoints = (
    await Promise.all(
      (await readModelEndpointIndex(storage)).map(async (endpointId) => {
        const endpoint = await readModelEndpoint(storage, endpointId);
        return endpoint === null
          ? null
          : projectModelEndpointReadModel(endpoint, activeEndpointId);
      }),
    )
  ).filter(
    (endpoint): endpoint is WanexAppModelEndpointReadModel => endpoint !== null,
  );
  return {
    ...(activeEndpointId === null ? {} : { activeEndpointId }),
    endpoints,
  };
}

export async function listWanexAppModelEndpointValues(
  storage: CoreStore,
): Promise<readonly ModelEndpoint[]> {
  return (
    await Promise.all(
      (await readModelEndpointIndex(storage)).map((endpointId) =>
        readModelEndpoint(storage, endpointId),
      ),
    )
  ).filter((endpoint): endpoint is ModelEndpoint => endpoint !== null);
}

export async function readWanexAppActiveModelEndpointId(
  storage: CoreStore,
): Promise<string | undefined> {
  return (await readActiveModelEndpointId(storage)) ?? undefined;
}

export async function requireWanexAppActiveModelEndpointId(
  storage: CoreStore,
): Promise<string> {
  const endpointId = await readActiveModelEndpointId(storage);
  if (endpointId === null) {
    throw new Error("app active model endpoint is not configured");
  }
  return endpointId;
}

export function projectModelEndpointReadModel(
  endpoint: ModelEndpoint,
  activeEndpointId: string | null,
): WanexAppModelEndpointReadModel {
  const normalized = modelEndpointFromJson(modelEndpointToJson(endpoint));
  return {
    id: normalized.id,
    connection: {
      id: normalized.connection.id,
      providerId: normalized.connection.providerId,
      ...(normalized.connection.baseUrl === undefined
        ? {}
        : { baseUrl: normalized.connection.baseUrl }),
    },
    protocol: normalized.protocol,
    model: normalized.model,
    credentialConfigured: normalized.connection.secretRef !== undefined,
    active: normalized.id === activeEndpointId,
  };
}

async function readActiveModelEndpointId(
  storage: CoreStore,
): Promise<string | null> {
  const value = await storage.getConfig(APP_ACTIVE_MODEL_ENDPOINT_KEY);
  if (value === null) {
    return null;
  }
  if (!isNonEmptyString(value)) {
    throw new Error("app active model endpoint id must be a string");
  }
  return value;
}

async function readModelEndpointIndex(
  storage: CoreStore,
): Promise<readonly string[]> {
  const value = await storage.getConfig(APP_MODEL_ENDPOINT_INDEX_KEY);
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw new Error("app model endpoint index must be a string array");
  }
  return [...value].sort();
}

function addEndpointId(
  endpointIds: readonly string[],
  endpointId: string,
): readonly string[] {
  if (endpointId.length === 0) {
    throw new Error("model endpoint id must not be empty");
  }
  return [...new Set([...endpointIds, endpointId])].sort();
}

function addEndpointIds(
  endpointIds: readonly string[],
  additions: readonly string[],
): readonly string[] {
  return additions.reduce(addEndpointId, endpointIds);
}

function isNonEmptyString(value: JsonValue): value is string {
  return typeof value === "string" && value.length > 0;
}
