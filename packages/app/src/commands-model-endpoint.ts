import {
  listWanexAppModelEndpoints,
  readWanexAppActiveModelEndpoint,
  readWanexAppModelEndpoint,
  setWanexAppActiveModelEndpoint,
  upsertWanexAppSiblingModelEndpoint,
  replaceWanexAppConnectedModelEndpoints,
  removeWanexAppModelEndpointConnection,
  upsertWanexAppModelEndpoint,
} from "./model-endpoint.js";
import type { WanexAppCommandContext } from "./command-context.js";
import type { WanexAppModelEndpointCommands } from "./types-model-endpoint.js";

export function createWanexAppModelEndpointCommands(
  context: WanexAppCommandContext,
): WanexAppModelEndpointCommands {
  return {
    async readActiveModelEndpoint() {
      context.assertActive();
      const endpoint = await readWanexAppActiveModelEndpoint(
        context.runtime.storage,
      );
      context.setActiveModelEndpointId(endpoint?.id);
      return endpoint;
    },
    async setActiveModelEndpoint(request) {
      context.assertActive();
      const endpoint = await setWanexAppActiveModelEndpoint({
        storage: context.runtime.storage,
        endpointId: request.endpointId,
      });
      context.setActiveModelEndpointId(endpoint.id);
      context.goalCoordinator.signalActiveGoals();
      return endpoint;
    },
    async upsertModelEndpoint(request) {
      context.assertActive();
      const endpoint = await upsertWanexAppModelEndpoint({
        storage: context.runtime.storage,
        modelEndpoint: request.modelEndpoint,
        ...(request.makeActive === undefined
          ? {}
          : { makeActive: request.makeActive }),
      });
      if (endpoint.active) {
        context.setActiveModelEndpointId(endpoint.id);
        context.goalCoordinator.signalActiveGoals();
      }
      return endpoint;
    },
    async replaceConnectedModelEndpoints(request) {
      context.assertActive();
      const endpoints = await replaceWanexAppConnectedModelEndpoints({
        storage: context.runtime.storage,
        connection: request.connection,
        endpoints: request.endpoints,
        ...(request.makeActiveEndpointId === undefined
          ? {}
          : { makeActiveEndpointId: request.makeActiveEndpointId }),
        ...(request.activateByDefault === undefined
          ? {}
          : { activateByDefault: request.activateByDefault }),
      });
      const active = await readWanexAppActiveModelEndpoint(
        context.runtime.storage,
      );
      context.setActiveModelEndpointId(active?.id);
      context.goalCoordinator.signalActiveGoals();
      return endpoints;
    },
    async removeModelEndpointConnection(request) {
      context.assertActive();
      const result = await removeWanexAppModelEndpointConnection({
        storage: context.runtime.storage,
        connectionId: request.connectionId,
      });
      context.setActiveModelEndpointId(result.activeEndpointId);
      context.goalCoordinator.signalActiveGoals();
      return result;
    },
    async upsertSiblingModelEndpoint(request) {
      context.assertActive();
      const endpoint = await upsertWanexAppSiblingModelEndpoint({
        storage: context.runtime.storage,
        sourceEndpointId: request.sourceEndpointId,
        endpoint: request.endpoint,
        ...(request.makeActive === undefined
          ? {}
          : { makeActive: request.makeActive }),
      });
      if (endpoint.active) {
        context.setActiveModelEndpointId(endpoint.id);
        context.goalCoordinator.signalActiveGoals();
      }
      return endpoint;
    },
    async readModelEndpoint(request) {
      context.assertActive();
      return await readWanexAppModelEndpoint({
        storage: context.runtime.storage,
        endpointId: request.endpointId,
      });
    },
    async listModelEndpoints() {
      context.assertActive();
      const endpoints = await listWanexAppModelEndpoints(
        context.runtime.storage,
      );
      context.setActiveModelEndpointId(endpoints.activeEndpointId);
      return endpoints;
    },
  };
}
