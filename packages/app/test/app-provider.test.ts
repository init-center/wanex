import { describe, expect, it } from "vitest";
import {
  createStorageHandle,
  type CoreStore,
} from "@wanex/storage";
import { createStorageTestStore } from "@wanex/storage/testing";
import { createWanexApp } from "../src/internal-index.js";
import { createStoreDir, serviceBin } from "./helpers.js";
import { appTestModelEndpoint } from "./model-endpoint-fixture.js";

describe("@wanex/app model endpoint commands", () => {
  it("initializes a trusted complete model endpoint at startup", async () => {
    const storeDir = await createStoreDir();
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "startup-openai-compatible",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "startup-model",
        baseUrl: "https://api.example.invalid/v1",
        secretRef: "env://STARTUP_PROVIDER_API_KEY",
      }),
    });
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });

    try {
      await expect(app.commands.readActiveModelEndpoint()).resolves.toEqual({
        id: "startup-openai-compatible",
        connection: {
          id: "connection_startup-openai-compatible",
          providerId: "openai-compatible",
          baseUrl: "https://api.example.invalid/v1",
        },
        protocol: { id: "openai-chat-completions" },
        model: appTestModelEndpoint({ modelId: "startup-model" }).model,
        credentialConfigured: true,
        active: true,
      });
      expect(
        JSON.stringify(await app.commands.listModelEndpoints()),
      ).not.toContain("STARTUP_PROVIDER_API_KEY");
      await expect(
        storage.getConfig("model.endpoint.startup-openai-compatible"),
      ).resolves.toMatchObject({
        connection: { secretRef: "env://STARTUP_PROVIDER_API_KEY" },
      });
    } finally {
      await storage.dispose();
      await app.dispose();
    }
  });

  it("starts unconfigured and manages model endpoints through redacted commands", async () => {
    const storeDir = await createStoreDir();
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
    });
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });

    try {
      expect(app.status()).not.toHaveProperty("activeModelEndpointId");
      await expect(app.commands.readActiveModelEndpoint()).resolves.toBeNull();
      await expect(app.commands.listModelEndpoints()).resolves.toEqual({
        endpoints: [],
      });
      await expect(
        app.commands.runAgentTurn({
          content: [{ type: "text", text: "cannot admit without provider" }],
          sessionId: "ses_wanex_app_unconfigured",
        }),
      ).rejects.toThrow("app active model endpoint is not configured");
      await expect(
        storage.listJobs({ kind: "session.turn", limit: 10 }),
      ).resolves.toEqual([]);

      await expect(
        app.commands.upsertModelEndpoint({
          modelEndpoint: appTestModelEndpoint({
            endpointId: "openai-compatible-redacted",
            protocolId: "openai-chat-completions",
            providerId: "openai-compatible",
            modelId: "redacted-model",
            baseUrl: "https://api.example.invalid/v1",
            secretRef: "env://REDACTED_PROVIDER_API_KEY",
          }),
        }),
      ).resolves.toMatchObject({
        id: "openai-compatible-redacted",
        connection: { providerId: "openai-compatible" },
        protocol: { id: "openai-chat-completions" },
        model: { id: "redacted-model" },
        credentialConfigured: true,
        active: true,
      });
      await expect(app.commands.listModelEndpoints()).resolves.toMatchObject({
        activeEndpointId: "openai-compatible-redacted",
        endpoints: [
          {
            id: "openai-compatible-redacted",
            active: true,
          },
        ],
      });
      const storedEndpoint = await storage.getConfig(
        "model.endpoint.openai-compatible-redacted",
      );
      expect(storedEndpoint).toMatchObject({
        connection: { secretRef: "env://REDACTED_PROVIDER_API_KEY" },
      });
      expect(
        JSON.stringify(
          await app.commands.readModelEndpoint({
            endpointId: "openai-compatible-redacted",
          }),
        ),
      ).not.toContain("REDACTED_PROVIDER_API_KEY");

      const connected = await app.commands.replaceConnectedModelEndpoints({
        connection: {
          id: "connection-connected-set",
          providerId: "openai-compatible",
          baseUrl: "https://connected.example.invalid/v1",
          secretRef: "env://CONNECTED_SET_API_KEY",
        },
        endpoints: [
          {
            id: "connected-conversation",
            protocol: { id: "openai-chat-completions" },
            model: appTestModelEndpoint({ modelId: "connected-model" }).model,
          },
          {
            id: "connected-image",
            protocol: { id: "openai-images" },
            model: appTestMediaEndpoint("connected-image").model,
          },
        ],
        makeActiveEndpointId: "connected-conversation",
      });
      expect(connected).toMatchObject([
        { id: "connected-conversation", active: true },
        { id: "connected-image", active: false },
      ]);
      expect(JSON.stringify(connected)).not.toContain("CONNECTED_SET_API_KEY");
      await expect(
        storage.getConfig("model.endpoint.connected-conversation"),
      ).resolves.toMatchObject({
        connection: { secretRef: "env://CONNECTED_SET_API_KEY" },
      });
      await expect(
        storage.getConfig("model.endpoint.connected-image"),
      ).resolves.toMatchObject({
        connection: { secretRef: "env://CONNECTED_SET_API_KEY" },
      });

      const sibling = await app.commands.upsertSiblingModelEndpoint({
        sourceEndpointId: "openai-compatible-redacted",
        endpoint: {
          id: "openai-compatible-redacted-image",
          protocol: { id: "openai-images" },
          model: {
            id: "image-model",
            operations: ["image.generate"],
            inputModalities: ["text"],
            outputModalities: ["image"],
            features: [],
            catalog: {
              source: "custom",
              catalogId: "test.image-model",
              revision: "1",
            },
          },
        },
        makeActive: false,
      });
      expect(sibling).toMatchObject({
        id: "openai-compatible-redacted-image",
        connection: {
          id: "connection_openai-compatible-redacted",
          baseUrl: "https://api.example.invalid/v1",
        },
        protocol: { id: "openai-images" },
        credentialConfigured: true,
        active: false,
      });
      expect(JSON.stringify(sibling)).not.toContain(
        "REDACTED_PROVIDER_API_KEY",
      );
      await expect(
        storage.getConfig("model.endpoint.openai-compatible-redacted-image"),
      ).resolves.toMatchObject({
        connection: { secretRef: "env://REDACTED_PROVIDER_API_KEY" },
      });

      await expect(
        app.commands.upsertModelEndpoint({
          modelEndpoint: appTestModelEndpoint({
            endpointId: "second-fake",
            modelId: "second-model",
          }),
          makeActive: true,
        }),
      ).resolves.toMatchObject({
        id: "second-fake",
        active: true,
      });
      await expect(
        app.commands.upsertSiblingModelEndpoint({
          sourceEndpointId: "second-fake",
          endpoint: {
            id: "second-fake-sibling",
            protocol: { id: "fake" },
            model: appTestModelEndpoint().model,
          },
        }),
      ).rejects.toThrow(
        "source model endpoint has no configured credential: second-fake",
      );
      expect(app.status()).toMatchObject({
        activeModelEndpointId: "second-fake",
      });
      await expect(
        app.commands.runAgentTurn({
          content: [{ type: "text", text: "uses switched profile" }],
          sessionId: "ses_wanex_app_profile_switch",
        }),
      ).resolves.toMatchObject({
        assistantText: "Fake response from second-model",
      });

      await expect(
        app.commands.setActiveModelEndpoint({
          endpointId: "missing-endpoint",
        }),
      ).rejects.toThrow("model endpoint not found: missing-endpoint");
      await expect(
        app.commands.safeCommand({
          command: "setActiveModelEndpoint",
          run: () =>
            app.commands.setActiveModelEndpoint({
              endpointId: "missing-endpoint",
            }),
        }),
      ).resolves.toEqual({
        ok: false,
        command: "setActiveModelEndpoint",
        error: {
          code: "validation_error",
          category: "validation",
          message: "model endpoint not found: missing-endpoint",
        },
      });
      await expect(
        app.commands.readModelEndpoint({
          endpointId: "missing-endpoint",
        }),
      ).resolves.toBeNull();
    } finally {
      await storage.dispose();
      await app.dispose();
    }
  });

  it("keeps media-only endpoints outside active conversation policy", async () => {
    const storeDir = await createStoreDir();
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
    });
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });
    const mediaOnly = appTestMediaEndpoint("media-only");

    try {
      await expect(
        app.commands.upsertModelEndpoint({ modelEndpoint: mediaOnly }),
      ).resolves.toMatchObject({
        id: "media-only",
        active: false,
      });
      await expect(app.commands.readActiveModelEndpoint()).resolves.toBeNull();
      await expect(
        app.commands.setActiveModelEndpoint({ endpointId: "media-only" }),
      ).rejects.toThrow("openai-images model must support conversation");

      await expect(
        app.commands.upsertModelEndpoint({
          modelEndpoint: appTestMediaEndpoint("explicit-media"),
          makeActive: true,
        }),
      ).rejects.toThrow("openai-images model must support conversation");
      await expect(
        app.commands.readModelEndpoint({ endpointId: "explicit-media" }),
      ).resolves.toBeNull();

      await app.commands.upsertModelEndpoint({
        modelEndpoint: appTestModelEndpoint({
          endpointId: "conversation-active",
          modelId: "conversation-model",
        }),
      });
      await expect(app.commands.readActiveModelEndpoint()).resolves.toMatchObject({
        id: "conversation-active",
        active: true,
      });
      await expect(
        app.commands.upsertModelEndpoint({
          modelEndpoint: {
            ...appTestMediaEndpoint("replacement"),
            id: "conversation-active",
          },
          makeActive: false,
        }),
      ).rejects.toThrow("openai-images model must support conversation");
      await expect(
        app.commands.readModelEndpoint({ endpointId: "conversation-active" }),
      ).resolves.toMatchObject({
        active: true,
        protocol: { id: "fake" },
        model: { id: "conversation-model" },
      });
      await expect(
        storage.getConfig("wanex-app.modelEndpoint.activeEndpointId"),
      ).resolves.toBe("conversation-active");
    } finally {
      await storage.dispose();
      await app.dispose();
    }
  });

  it("keeps a connected endpoint set invisible when its atomic commit fails", async () => {
    const storeDir = await createStoreDir();
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin,
    });
    const core = new Proxy(handle.core, {
      get(target, property) {
        if (property === "applyConfigMutations") {
          return async (
            _request: Parameters<CoreStore["applyConfigMutations"]>[0],
          ) => {
            throw new Error("injected connected endpoint commit failure");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const app = await createWanexApp({
      storage: {
        kind: "injected",
        handle: { core, transport: handle.transport },
      },
    });

    try {
      await expect(
        app.commands.replaceConnectedModelEndpoints({
          connection: {
            id: "atomic-connection",
            providerId: "openai-compatible",
            baseUrl: "https://atomic.example.invalid/v1",
            secretRef: "env://ATOMIC_CONNECTED_KEY",
          },
          endpoints: [
            {
              id: "atomic-conversation",
              protocol: { id: "openai-chat-completions" },
              model: appTestModelEndpoint({ modelId: "atomic-model" }).model,
            },
            {
              id: "atomic-image",
              protocol: { id: "openai-images" },
              model: appTestMediaEndpoint("atomic-image").model,
            },
          ],
          makeActiveEndpointId: "atomic-conversation",
        }),
      ).rejects.toThrow("injected connected endpoint commit failure");
      await expect(
        handle.core.getConfig("model.endpoint.atomic-conversation"),
      ).resolves.toBeNull();
      await expect(
        handle.core.getConfig("model.endpoint.atomic-image"),
      ).resolves.toBeNull();
      await expect(
        handle.core.getConfig("wanex-app.modelEndpoint.endpointIndex"),
      ).resolves.toBeNull();
      await expect(
        handle.core.getConfig("wanex-app.modelEndpoint.activeEndpointId"),
      ).resolves.toBeNull();
    } finally {
      await app.dispose();
      await handle.dispose();
    }
  });

  it("preserves an existing endpoint graph when replacement or removal fails", async () => {
    const storeDir = await createStoreDir();
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin,
    });
    const seed = await createWanexApp({
      storage: {
        kind: "injected",
        handle: { core: handle.core, transport: handle.transport },
      },
    });
    const connection = {
      id: "atomic-existing",
      providerId: "openai-compatible",
      baseUrl: "https://atomic-existing.example.invalid/v1",
      secretRef: "env://ATOMIC_EXISTING_KEY",
    };
    await seed.commands.replaceConnectedModelEndpoints({
      connection,
      endpoints: [
        {
          id: "atomic-existing-conversation",
          protocol: { id: "openai-chat-completions" },
          model: appTestModelEndpoint({ modelId: "atomic-existing-model" }).model,
        },
        {
          id: "atomic-existing-image",
          protocol: { id: "openai-images" },
          model: appTestMediaEndpoint("atomic-existing-image").model,
        },
      ],
      makeActiveEndpointId: "atomic-existing-conversation",
    });
    await seed.commands.setModelCapabilityRoute({
      operation: "image.generate",
      modelEndpointId: "atomic-existing-image",
    });
    await seed.dispose();

    const core = new Proxy(handle.core, {
      get(target, property) {
        if (property === "applyConfigMutations") {
          return async () => {
            throw new Error("injected existing graph commit failure");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const app = await createWanexApp({
      storage: {
        kind: "injected",
        handle: { core, transport: handle.transport },
      },
    });
    const keys = [
      "model.endpoint.atomic-existing-conversation",
      "model.endpoint.atomic-existing-image",
      "wanex-app.modelEndpoint.endpointIndex",
      "wanex-app.modelEndpoint.activeEndpointId",
      "wanex-app.modelCapability.routes",
    ] as const;

    try {
      const before = await Promise.all(keys.map((key) => handle.core.getConfig(key)));
      await expect(app.commands.replaceConnectedModelEndpoints({
        connection,
        endpoints: [{
          id: "atomic-existing-conversation",
          protocol: { id: "openai-chat-completions" },
          model: appTestModelEndpoint({ modelId: "atomic-replacement" }).model,
        }],
      })).rejects.toThrow("injected existing graph commit failure");
      await expect(app.commands.removeModelEndpointConnection({
        connectionId: connection.id,
      })).rejects.toThrow("injected existing graph commit failure");
      const after = await Promise.all(keys.map((key) => handle.core.getConfig(key)));
      expect(after).toEqual(before);
    } finally {
      await app.dispose();
      await handle.dispose();
    }
  });

  it("replaces and removes exact connection groups with deterministic cleanup", async () => {
    const storeDir = await createStoreDir();
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
    });
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });
    const connection = {
      id: "connection-managed",
      providerId: "openai-compatible",
      baseUrl: "https://managed.example.invalid/v1",
      secretRef: "env://MANAGED_PROVIDER_KEY",
    };

    try {
      await app.commands.replaceConnectedModelEndpoints({
        connection,
        endpoints: [
          {
            id: "managed-conversation",
            protocol: { id: "openai-chat-completions" },
            model: appTestModelEndpoint({ modelId: "managed-model" }).model,
          },
          {
            id: "managed-image",
            protocol: { id: "openai-images" },
            model: appTestMediaEndpoint("managed-image").model,
          },
        ],
        makeActiveEndpointId: "managed-conversation",
      });
      await app.commands.setModelCapabilityRoute({
        operation: "image.generate",
        modelEndpointId: "managed-image",
      });
      await app.commands.replaceConnectedModelEndpoints({
        connection: {
          id: "connection-fallback",
          providerId: "fake",
        },
        endpoints: [{
          id: "fallback-conversation",
          protocol: { id: "fake" },
          model: appTestModelEndpoint({ modelId: "fallback-model" }).model,
        }],
        activateByDefault: false,
      });

      await expect(app.commands.replaceConnectedModelEndpoints({
        connection,
        endpoints: [{
          id: "managed-conversation",
          protocol: { id: "openai-chat-completions" },
          model: appTestModelEndpoint({ modelId: "managed-model-v2" }).model,
        }],
      })).resolves.toMatchObject([
        { id: "managed-conversation", active: true, model: { id: "managed-model-v2" } },
      ]);
      await expect(
        storage.getConfig("model.endpoint.managed-image"),
      ).resolves.toBeNull();
      await expect(app.commands.listModelCapabilityRoutes()).resolves.toEqual({
        routes: [],
      });

      await expect(app.commands.removeModelEndpointConnection({
        connectionId: connection.id,
      })).resolves.toEqual({
        connectionId: connection.id,
        removedEndpointIds: ["managed-conversation"],
        activeEndpointId: "fallback-conversation",
      });
      await expect(app.commands.readActiveModelEndpoint()).resolves.toMatchObject({
        id: "fallback-conversation",
        active: true,
      });
      await expect(app.commands.removeModelEndpointConnection({
        connectionId: "connection-fallback",
      })).resolves.toEqual({
        connectionId: "connection-fallback",
        removedEndpointIds: ["fallback-conversation"],
      });
      await expect(app.commands.listModelEndpoints()).resolves.toEqual({
        endpoints: [],
      });
      await expect(
        storage.getConfig("wanex-app.modelEndpoint.activeEndpointId"),
      ).resolves.toBeNull();
    } finally {
      await storage.dispose();
      await app.dispose();
    }
  });

  it("keeps the active model endpoint across wanex-app restarts", async () => {
    const storeDir = await createStoreDir();
    const first = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
    });

    try {
      await expect(
        first.commands.upsertModelEndpoint({
          modelEndpoint: appTestModelEndpoint({
            endpointId: "persisted-fake",
            modelId: "persisted-model",
          }),
          makeActive: true,
        }),
      ).resolves.toMatchObject({
        id: "persisted-fake",
        active: true,
      });
    } finally {
      await first.dispose();
    }

    const second = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
    });

    try {
      expect(second.status()).toMatchObject({
        activeModelEndpointId: "persisted-fake",
      });
      await expect(second.commands.listModelEndpoints()).resolves.toMatchObject(
        {
          activeEndpointId: "persisted-fake",
          endpoints: [
            {
              id: "persisted-fake",
              active: true,
            },
          ],
        },
      );
      await expect(
        second.commands.runAgentTurn({
          content: [{ type: "text", text: "after restart" }],
          sessionId: "ses_wanex_app_profile_restart",
        }),
      ).resolves.toMatchObject({
        assistantText: "Fake response from persisted-model",
      });
    } finally {
      await second.dispose();
    }
  });

  it("freezes model endpoint per turn and regenerates as a fresh binding", async () => {
    const storeDir = await createStoreDir();
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir,
      },
      artifacts: {
        explicitPath: serviceBin,
      },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "first-endpoint",
        modelId: "first-model",
      }),
      workerCount: 2,
    });
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });

    try {
      await app.stop();
      const first = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "first admission" }],
        sessionId: "ses_app_provider_binding_first",
      });
      await app.commands.upsertModelEndpoint({
        modelEndpoint: appTestModelEndpoint({
          endpointId: "second-endpoint",
          modelId: "second-model",
        }),
        makeActive: true,
      });
      const second = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "second admission" }],
        sessionId: "ses_app_provider_binding_second",
      });

      const firstQueued = (
        await storage.listSessionTurns({ sessionId: first.sessionId })
      )[0];
      const secondQueued = (
        await storage.listSessionTurns({ sessionId: second.sessionId })
      )[0];
      expect(firstQueued?.executionBinding.modelEndpoint.endpointId).toBe(
        "first-endpoint",
      );
      expect(secondQueued?.executionBinding.modelEndpoint.endpointId).toBe(
        "second-endpoint",
      );

      app.start();
      await terminalOperation(app, first);
      await terminalOperation(app, second);

      const regenerated = await app.commands.submitConversationOperation({
        content: [
          { type: "text", text: "regenerate first with current policy" },
        ],
        sessionId: first.sessionId,
        regeneratesTurnId: first.turnId,
      });
      expect(regenerated.inputId).not.toBe(first.inputId);
      expect(regenerated.turnId).not.toBe(first.turnId);
      expect(regenerated.jobId).not.toBe(first.jobId);
      await terminalOperation(app, regenerated);

      const turns = await storage.listSessionTurns({
        sessionId: first.sessionId,
      });
      expect(turns).toHaveLength(2);
      expect(turns[0]).toMatchObject({
        id: first.turnId,
      });
      expect(turns[0]?.regeneratesTurnId).toBeUndefined();
      expect(turns[0]?.executionBinding.modelEndpoint.endpointId).toBe(
        "first-endpoint",
      );
      expect(turns[1]).toMatchObject({
        id: regenerated.turnId,
        regeneratesTurnId: first.turnId,
      });
      expect(turns[1]?.executionBinding.modelEndpoint.endpointId).toBe(
        "second-endpoint",
      );
    } finally {
      await storage.dispose();
      await app.dispose();
    }
  });
});

function appTestMediaEndpoint(endpointId: string) {
  return {
    id: endpointId,
    connection: {
      id: `connection_${endpointId}`,
      providerId: "openai",
    },
    protocol: { id: "openai-images" },
    model: {
      id: `${endpointId}-model`,
      operations: ["image.generate" as const],
      inputModalities: ["text" as const],
      outputModalities: ["image" as const],
      features: [],
      catalog: {
        source: "custom" as const,
        catalogId: `test.${endpointId}`,
        revision: "1",
      },
    },
  };
}

async function terminalOperation(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  reference: {
    readonly sessionId: string;
    readonly inputId: string;
    readonly turnId: string;
    readonly jobId: string;
  },
) {
  let lastState = "missing";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await app.commands.readConversationOperation(reference);
    if (result.kind === "found") {
      lastState = result.operation.state;
      if (result.operation.state === "succeeded") {
        return result.operation;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`conversation operation did not succeed: ${lastState}`);
}
