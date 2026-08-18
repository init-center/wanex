import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryResolvedSecret,
  type SecretStorePort,
} from "@wanex/runtime/secrets";
import {
  startLocalWebApp,
  type LocalWebApp,
} from "../src/index.js";
import { createStorageTestStore } from "@wanex/storage/testing";
import type {
  ConversationEvent,
  ConversationPresentationPart,
} from "@wanex/product";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

const apps: LocalWebApp[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (apps.length > 0) await apps.pop()?.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

describe("local host hot image generation", () => {
  it("reuses the active credential and continues a linked capability request", async () => {
    const generatedBytes = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6]);
    const conversationRequests: Record<string, unknown>[] = [];
    const imageRequests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        conversationRequests.push(body);
        switch (conversationRequests.length) {
          case 1:
            return openAIToolResponse(
              "capability_request",
              "call_capability_request",
              { operation: "image.generate" },
            );
          case 2:
            return openAITextResponse("Image generation needs setup.");
          case 3:
            return openAIToolResponse(
              "image_generate",
              "call_linked_image_generate",
              { prompt: "a linked blue square" },
            );
          case 4:
            return openAITextResponse("Your linked image is ready.");
          default:
            throw new Error("unexpected additional conversation request");
        }
      }
      if (url.endsWith("/images/generations")) {
        imageRequests.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        );
        return new Response(
          JSON.stringify({
            data: [
              { b64_json: Buffer.from(generatedBytes).toString("base64") },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected provider URL: ${url}`);
    });

    const storeDir = await mkdtemp(join(tmpdir(), "wanex-linked-image-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" },
    });
    apps.push(app);

    await app.providers.saveProvider({
      presetId: "openai",
      conversationModelId: "linked-conversation-model",
      credential: "linked-one-connection-secret",
      makeConversationActive: true,
    });
    expect(credentialStore.refs()).toHaveLength(1);

    const submitted = await app.shell.submitConversationOperation({
      sessionId: "linked-image-session",
      text: "Generate a linked blue square.",
    });
    if (submitted.kind !== "product.conversation-operation.found") {
      throw new Error("capability request conversation was not submitted");
    }
    const source = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "linked-image-session",
      });
      expect(current).toMatchObject({
        kind: "product.conversation-operation.found",
        operation: {
          state: "succeeded",
          transcript: {
            rows: expect.arrayContaining([
              expect.objectContaining({
                capabilityRequests: [
                  expect.objectContaining({
                    operation: "image.generate",
                    setupRequired: true,
                  }),
                ],
              }),
            ]),
          },
        },
      });
      return current;
    });
    if (source.kind !== "product.conversation-operation.found") {
      throw new Error("capability request source operation was not found");
    }

    await expect(
      app.capabilitySetup.setupImageGenerationAndContinue({
        operationId: `${source.operation.operationId}-stale`,
        sessionId: source.operation.sessionId,
        operation: "image.generate",
        imageGenerationModelId: "linked-image-model",
      }),
    ).resolves.toMatchObject({
      kind: "local-host.capability-setup.rejected",
      reason: "operation_not_current",
    });
    await expect(
      app.modelEndpoints.listModelEndpoints(),
    ).resolves.toMatchObject({
      endpoints: [expect.objectContaining({ id: "openai" })],
    });

    const continued = await app.capabilitySetup.setupImageGenerationAndContinue(
      {
        operationId: source.operation.operationId,
        sessionId: source.operation.sessionId,
        operation: "image.generate",
        imageGenerationModelId: "linked-image-model",
      },
    );
    expect(continued).toMatchObject({
      kind: "local-host.capability-setup.continued",
      setup: {
        endpoint: {
          id: "openai.image-generate",
          credentialConfigured: true,
          active: false,
        },
        readiness: { status: "ready" },
      },
      operation: {
        operation: { sessionId: "linked-image-session" },
      },
    });
    expect(credentialStore.refs()).toHaveLength(1);
    expect(JSON.stringify(continued)).not.toContain("secretRef");
    expect(JSON.stringify(continued)).not.toContain(
      "linked-one-connection-secret",
    );

    const terminal = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "linked-image-session",
      });
      expect(current).toMatchObject({
        kind: "product.conversation-operation.found",
        operation: { state: "succeeded" },
      });
      return current;
    });
    if (terminal.kind !== "product.conversation-operation.found") {
      throw new Error("linked operation did not complete");
    }
    const generated = terminal.operation.transcript.rows
      .flatMap((row) => conversationResources(row.parts))
      .find((resource) => resource.kind === "image");
    if (generated === undefined) {
      throw new Error("linked operation did not publish an image resource");
    }
    await expect(readDeliveredImage(
      app,
      "linked-image-session",
      generated.resourceId,
      generated.sha256,
    )).resolves.toEqual(generatedBytes);

    const history = await app.shell.readSessionTranscript({
      sessionId: "linked-image-session",
    });
    if (history.kind !== "product.session-transcript.found") {
      throw new Error("linked session transcript was not found");
    }
    expect(
      history.transcript.rows
        .filter((row) => row.role === "user")
        .map((row) => conversationText(row.parts)),
    ).toEqual(["Generate a linked blue square."]);
    expect(imageRequests).toEqual([
      {
        model: "linked-image-model",
        prompt: "a linked blue square",
      },
    ]);

    await app.close();
    apps.pop();
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });
    try {
      const [inputs, turns] = await Promise.all([
        storage.listSessionInputs({ sessionId: "linked-image-session" }),
        storage.listSessionTurns({ sessionId: "linked-image-session" }),
      ]);
      expect(inputs).toHaveLength(2);
      expect(inputs.map((input) => input.content)).toEqual([
        expect.arrayContaining([
          expect.objectContaining({ text: "Generate a linked blue square." }),
        ]),
        expect.arrayContaining([
          expect.objectContaining({ text: "Generate a linked blue square." }),
        ]),
      ]);
      expect(turns).toHaveLength(2);
      expect(turns[1]?.regeneratesTurnId).toBe(turns[0]?.id);
      expect(JSON.stringify(turns[1]?.executionBinding.toolSnapshot)).toContain(
        '"name":"image_generate"',
      );
    } finally {
      await storage.dispose();
    }
  });

  it("configures and executes ordinary chat image generation without restart", async () => {
    const generatedBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4,
    ]);
    const conversationRequests: Record<string, unknown>[] = [];
    const imageRequests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        conversationRequests.push(body);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const hasToolResult = messages.some(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            (message as { readonly role?: unknown }).role === "tool",
        );
        return hasToolResult
          ? openAITextResponse("Your generated image is ready.")
          : openAIImageToolResponse();
      }
      if (url.endsWith("/images/generations")) {
        imageRequests.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        );
        return new Response(
          JSON.stringify({
            data: [
              { b64_json: Buffer.from(generatedBytes).toString("base64") },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected provider URL: ${url}`);
    });

    const storeDir = await mkdtemp(join(tmpdir(), "wanex-hot-image-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" },
    });
    apps.push(app);

    await expect(app.modelEndpoints.listModelEndpoints()).resolves.toEqual({
      endpoints: [],
    });
    await expect(
      app.shell.submitConversationOperation({
        text: "Generate an image before setup.",
      }),
    ).resolves.toMatchObject({
      kind: "product.conversation-operation.rejected",
      reason: "provider_not_ready",
    });

    const configured = await app.providers.saveProvider({
      presetId: "openai",
      conversationModelId: "gpt-5.2",
      imageGenerationModelId: "image-model-test",
      credential: "one-connection-secret",
      makeConversationActive: true,
    });
    expect(configured).toMatchObject({
      kind: "local-host.provider.saved",
      provider: {
        connectionId: "openai",
        active: true,
        credentialConfigured: true,
        endpoints: [
          { id: "openai", active: true },
          { id: "openai.image-generate", protocol: { id: "openai-images" }, active: false },
        ],
      },
    });
    expect(credentialStore.refs()).toHaveLength(1);

    const conversationEvents: ConversationEvent[] = [];
    const unsubscribeConversationEvents =
      app.shell.events.subscribeConversationEvents((event) => {
        conversationEvents.push(event);
      });

    const submitted = await app.shell.submitConversationOperation({
      sessionId: "hot-image-session",
      text: "Generate a small red triangle image.",
    });
    expect(submitted).toMatchObject({
      kind: "product.conversation-operation.found",
      operation: { sessionId: "hot-image-session" },
    });
    const terminal = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "hot-image-session",
      });
      expect(current).toMatchObject({
        kind: "product.conversation-operation.found",
        operation: {
          state: "succeeded",
          capabilities: { terminal: true },
          result: {
            assistantText: expect.stringContaining(
              "Your generated image is ready.",
            ),
          },
          transcript: {
            rows: expect.arrayContaining([
              expect.objectContaining({
                role: "assistant",
                parts: expect.arrayContaining([
                  expect.objectContaining({
                    type: "text",
                    text: "Your generated image is ready.",
                  }),
                ]),
              }),
            ]),
          },
        },
      });
      return current;
    });
    if (terminal.kind !== "product.conversation-operation.found") {
      throw new Error("terminal conversation operation was not found");
    }
    await eventually(async () => {
      expect(
        conversationEvents
          .filter(
            (event) =>
              event.kind ===
              "product.conversation.operation-invalidated",
          )
          .map((event) => event.cause),
      ).toEqual(["execution_suspended", "execution_completed"]);
    });
    unsubscribeConversationEvents();
    expect(
      terminal.operation.transcript.rows
        .flatMap((row) => row.parts)
        .filter(
          (part): part is Extract<
            ConversationPresentationPart,
            { readonly type: "tool" }
          > => part.type === "tool" && part.name === "image_generate",
        ),
    ).toEqual([
      expect.objectContaining({
        name: "image_generate",
        state: "succeeded",
      }),
    ]);
    const generatedResource = terminal.operation.transcript.rows
      .flatMap((row) => conversationResources(row.parts))
      .find((resource) => resource.kind === "image");
    expect(generatedResource).toMatchObject({
      resourceId: expect.any(String),
      sha256: createHash("sha256").update(generatedBytes).digest("hex"),
      sizeBytes: generatedBytes.byteLength,
      kind: "image",
      mediaType: "image/png",
    });
    if (generatedResource === undefined) {
      throw new Error("generated image resource was not projected");
    }
    await expect(readDeliveredImage(
      app,
      "hot-image-session",
      generatedResource.resourceId,
      generatedResource.sha256,
    )).resolves.toEqual(generatedBytes);

    expect(conversationRequests).toHaveLength(2);
    expect(conversationRequests[0]).toMatchObject({
      model: "gpt-5.2",
      tools: [{ type: "function", function: { name: "image_generate" } }],
    });
    expect(conversationRequests[1]).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          tool_call_id: "call_image_generate",
        }),
      ]),
    });
    expect(imageRequests).toEqual([
      {
        model: "image-model-test",
        prompt: "a small red triangle",
      },
    ]);
  });

  it("rejects unsupported image setup before writing a credential", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-image-reject-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" },
    });
    apps.push(app);

    await expect(
      app.providers.saveProvider({
        presetId: "deepseek",
        conversationModelId: "deepseek-chat-test",
        imageGenerationModelId: "unsupported-image-test",
        credential: "must-not-be-written",
      }),
    ).rejects.toThrow("does not support imageGenerationModelId");
    expect(credentialStore.refs()).toEqual([]);
    await expect(app.modelEndpoints.listModelEndpoints()).resolves.toEqual({
      endpoints: [],
    });
  });
});

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret";
  readonly #values = new Map<string, string>();

  async put(request: { readonly ref: string; readonly value: string }) {
    this.#values.set(request.ref, request.value);
  }

  async delete(ref: string) {
    this.#values.delete(ref);
  }

  async resolve(ref: string) {
    const value = this.#values.get(ref);
    if (value === undefined) throw new Error("test credential is unavailable");
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value,
    });
  }

  refs(): readonly string[] {
    return [...this.#values.keys()];
  }
}

async function eventually<T>(assertion: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

function openAIImageToolResponse(): Response {
  return eventStreamResponse({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_image_generate",
              function: {
                name: "image_generate",
                arguments: JSON.stringify({ prompt: "a small red triangle" }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  });
}

function openAIToolResponse(
  name: string,
  toolCallId: string,
  input: Record<string, unknown>,
): Response {
  return eventStreamResponse({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: toolCallId,
              function: { name, arguments: JSON.stringify(input) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  });
}

function openAITextResponse(text: string): Response {
  return eventStreamResponse({
    choices: [{ delta: { content: text }, finish_reason: "stop" }],
  });
}

function eventStreamResponse(value: unknown): Response {
  return new Response(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function conversationText(
  parts: readonly ConversationPresentationPart[],
): string {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

function conversationResources(
  parts: readonly ConversationPresentationPart[],
) {
  return parts.filter(
    (part): part is Extract<
      ConversationPresentationPart,
      { readonly type: "resource" }
    > => part.type === "resource",
  );
}

async function readDeliveredImage(
  app: LocalWebApp,
  sessionId: string,
  resourceId: string,
  sha256: string,
): Promise<Uint8Array> {
  const prepared = await app.resourceDeliveries.prepare({
    audience: "local-host-test",
    sessionId,
    resourceId,
    expectedSha256: sha256,
    purpose: "preview",
  });
  const opened = await app.resourceDeliveries.open({
    token: prepared.token,
    audience: "local-host-test",
    method: "GET",
  });
  if (opened.body === undefined) throw new Error("image delivery body is missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of opened.body) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const content = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}
