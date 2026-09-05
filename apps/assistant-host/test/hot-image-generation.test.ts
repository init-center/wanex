import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryResolvedSecret,
  type SecretStorePort,
} from "@wanex/runtime/secrets";
import {
  startAssistantWebApp,
  type AssistantWebApp,
} from "../src/index.js";
import { createStorageTestStore } from "@wanex/storage/testing";
import type {
  ConversationEvent,
  ConversationPresentationPart,
} from "@wanex/assistant";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

const apps: AssistantWebApp[] = [];
const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (apps.length > 0) await apps.pop()?.close();
  while (servers.length > 0) await closeServer(servers.pop());
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

describe("Assistant Host hot image generation", () => {
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
    const app = await startAssistantWebApp({
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
    if (submitted.kind !== "assistant.conversation-operation.found") {
      throw new Error("capability request conversation was not submitted");
    }
    const source = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "linked-image-session",
      });
      expect(current).toMatchObject({
        kind: "assistant.conversation-operation.found",
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
    if (source.kind !== "assistant.conversation-operation.found") {
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
      kind: "assistant-host.capability-setup.rejected",
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
      kind: "assistant-host.capability-setup.continued",
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
        kind: "assistant.conversation-operation.found",
        operation: { state: "succeeded" },
      });
      return current;
    });
    if (terminal.kind !== "assistant.conversation-operation.found") {
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
    if (history.kind !== "assistant.session-transcript.found") {
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
    const provider = await listenImageProvider({
      generatedBytes,
      finalText: "Your generated image is ready.",
    });

    const storeDir = await mkdtemp(join(tmpdir(), "wanex-hot-image-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startAssistantWebApp({
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
      kind: "assistant.conversation-operation.rejected",
      reason: "provider_not_ready",
    });

    const configured = await app.providers.saveProvider({
      presetId: "openai-compatible",
      baseUrl: provider.baseUrl,
      conversationModelId: "gpt-5.2",
      conversationFeatures: ["tool_calling"],
      imageGenerationModelId: "image-model-test",
      credential: "one-connection-secret",
      makeConversationActive: true,
    });
    expect(configured).toMatchObject({
      kind: "assistant-host.provider.saved",
      provider: {
        providerId: "openai-compatible",
        baseUrl: provider.baseUrl,
        active: true,
        credentialConfigured: true,
        endpoints: [
          { protocol: { id: "openai-chat-completions" }, active: true },
          { protocol: { id: "openai-images" }, active: false },
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
      kind: "assistant.conversation-operation.found",
      operation: { sessionId: "hot-image-session" },
    });
    const terminal = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "hot-image-session",
      });
      expect(current).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          state: "succeeded",
          capabilities: { terminal: true },
          result: {
            assistantText: "Your generated image is ready.",
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
    if (terminal.kind !== "assistant.conversation-operation.found") {
      throw new Error("terminal conversation operation was not found");
    }
    await eventually(async () => {
      expect(
        conversationEvents
          .filter(
            (event) =>
              event.kind ===
              "assistant.conversation.operation-invalidated",
          )
          .map((event) => event.cause),
      ).toEqual(["execution_suspended", "execution_settled"]);
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
    await expect(
      readDeliveredImageOverHttp(
        app,
        "hot-image-session",
        generatedResource.resourceId,
        generatedResource.sha256,
      ),
    ).resolves.toEqual(generatedBytes);

    expect(provider.conversationRequests).toHaveLength(2);
    expect(provider.conversationRequests[0]).toMatchObject({
      authorization: "Bearer one-connection-secret",
      body: {
        model: "gpt-5.2",
        tools: [{ type: "function", function: { name: "image_generate" } }],
      },
    });
    expect(provider.conversationRequests[1]).toMatchObject({
      authorization: "Bearer one-connection-secret",
      body: {
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            tool_call_id: "call_image_generate",
          }),
        ]),
      },
    });
    expect(provider.imageRequests).toEqual([
      {
        authorization: "Bearer one-connection-secret",
        body: {
          model: "image-model-test",
          prompt: "a small red triangle",
        },
      },
    ]);
  });

  it("keeps provider-rejected image generation visible and durable", async () => {
    const provider = await listenImageProvider({
      rejectImage: true,
      finalText: "The image could not be generated.",
    });

    const storeDir = await mkdtemp(join(tmpdir(), "wanex-failed-image-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startAssistantWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" },
    });
    apps.push(app);

    await app.providers.saveProvider({
      presetId: "openai-compatible",
      baseUrl: provider.baseUrl,
      conversationModelId: "failed-image-conversation-model",
      conversationFeatures: ["tool_calling"],
      imageGenerationModelId: "failed-image-model",
      credential: "failed-image-secret",
      makeConversationActive: true,
    });
    const submitted = await app.shell.submitConversationOperation({
      sessionId: "failed-image-session",
      text: "Generate an image that the provider will reject.",
    });
    expect(submitted).toMatchObject({
      kind: "assistant.conversation-operation.found",
      operation: { sessionId: "failed-image-session" },
    });

    const terminal = await eventually(async () => {
      const current = await app.shell.readTrackedConversationOperation({
        sessionId: "failed-image-session",
      });
      expect(current).toMatchObject({
        kind: "assistant.conversation-operation.found",
        operation: {
          state: "succeeded",
          capabilities: { terminal: true },
          result: {
            assistantText: "The image could not be generated.",
          },
        },
      });
      return current;
    });
    if (terminal.kind !== "assistant.conversation-operation.found") {
      throw new Error("failed image conversation did not settle");
    }
    expect(
      terminal.operation.transcript.rows
        .filter((row) => row.role === "user")
        .map((row) => conversationText(row.parts)),
    ).toEqual(["Generate an image that the provider will reject."]);
    expect(
      terminal.operation.transcript.rows
        .flatMap((row) => row.parts)
        .filter(
          (
            part,
          ): part is Extract<
            ConversationPresentationPart,
            { readonly type: "tool" }
          > => part.type === "tool" && part.name === "image_generate",
        ),
    ).toEqual([
      expect.objectContaining({
        name: "image_generate",
        state: "failed",
      }),
    ]);
    expect(
      terminal.operation.transcript.rows.flatMap((row) =>
        conversationResources(row.parts),
      ),
    ).toEqual([]);
    expect(JSON.stringify(terminal)).not.toContain(
      "provider-private-policy-detail",
    );
    expect(JSON.stringify(terminal)).not.toContain("failed-image-secret");
    expect((await fetch(`${app.url}/`)).status).toBe(200);

    expect(provider.conversationRequests).toHaveLength(2);
    expect(provider.conversationRequests[1]).toMatchObject({
      authorization: "Bearer failed-image-secret",
      body: {
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            tool_call_id: "call_image_generate",
          }),
        ]),
      },
    });
    expect(JSON.stringify(provider.conversationRequests[1])).toContain(
      "media_generation_failed",
    );
    expect(JSON.stringify(provider.conversationRequests[1])).not.toContain(
      "provider-private-policy-detail",
    );
    expect(provider.imageRequests).toEqual([
      {
        authorization: "Bearer failed-image-secret",
        body: {
          model: "failed-image-model",
          prompt: "a small red triangle",
        },
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
      const operations = await storage.listMediaGenerationOperations({});
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        state: "failed",
        binding: {
          request: {
            operation: "image.generate",
            prompt: "a small red triangle",
            outputModality: "image",
          },
        },
        outputReferences: [],
        outputResourceIds: [],
        error: {
          type: "provider_rejection",
          statusCode: 400,
        },
      });
      expect(JSON.stringify(operations[0]?.error)).toContain(
        "provider-private-policy-detail",
      );
      const stateDb = await readFile(join(storeDir, "state.db"));
      expect(stateDb.includes("failed-image-secret")).toBe(false);
    } finally {
      await storage.dispose();
    }
  });

  it("rejects unsupported image setup before writing a credential", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-image-reject-"));
    tempDirs.push(storeDir);
    const credentialStore = new MemorySecretStore();
    const app = await startAssistantWebApp({
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

async function listenImageProvider(options: {
  readonly generatedBytes?: Uint8Array;
  readonly rejectImage?: boolean;
  readonly finalText: string;
}): Promise<{
  readonly baseUrl: string;
  readonly conversationRequests: Array<{
    readonly authorization: string;
    readonly body: Record<string, unknown>;
  }>;
  readonly imageRequests: Array<{
    readonly authorization: string;
    readonly body: Record<string, unknown>;
  }>;
}> {
  const conversationRequests: Array<{
    readonly authorization: string;
    readonly body: Record<string, unknown>;
  }> = [];
  const imageRequests: Array<{
    readonly authorization: string;
    readonly body: Record<string, unknown>;
  }> = [];
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readJsonRequest(request);
      const authorization = request.headers.authorization ?? "";
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method === "POST" && path === "/v1/chat/completions") {
        conversationRequests.push({ authorization, body });
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const hasToolResult = messages.some(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            (message as { readonly role?: unknown }).role === "tool",
        );
        writeEventStream(
          response,
          hasToolResult
            ? openAITextEvent(options.finalText)
            : openAIImageToolEvent(),
        );
        return;
      }
      if (request.method === "POST" && path === "/v1/images/generations") {
        imageRequests.push({ authorization, body });
        if (options.rejectImage) {
          response.writeHead(400, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(
            JSON.stringify({
              error: { message: "provider-private-policy-detail" },
            }),
          );
          return;
        }
        if (options.generatedBytes === undefined) {
          throw new Error("successful image fixture requires generated bytes");
        }
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from(options.generatedBytes).toString(
                  "base64",
                ),
              },
            ],
          }),
        );
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("image provider fixture did not expose a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    conversationRequests,
    imageRequests,
  };
}

async function readJsonRequest(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("image provider request body must be an object");
  }
  return value as Record<string, unknown>;
}

function writeEventStream(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  response.end(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`);
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });
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
  return eventStreamResponse(openAIImageToolEvent());
}

function openAIImageToolEvent(): unknown {
  return {
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
  };
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
  return eventStreamResponse(openAITextEvent(text));
}

function openAITextEvent(text: string): unknown {
  return {
    choices: [{ delta: { content: text }, finish_reason: "stop" }],
  };
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
  app: AssistantWebApp,
  sessionId: string,
  resourceId: string,
  sha256: string,
): Promise<Uint8Array> {
  const prepared = await app.resourceDeliveries.prepare({
    audience: "assistant-host-test",
    sessionId,
    resourceId,
    expectedSha256: sha256,
    purpose: "preview",
  });
  const opened = await app.resourceDeliveries.open({
    token: prepared.token,
    audience: "assistant-host-test",
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

async function readDeliveredImageOverHttp(
  app: AssistantWebApp,
  sessionId: string,
  resourceId: string,
  sha256: string,
): Promise<Uint8Array> {
  const root = await fetch(`${app.url}/`);
  const html = await root.text();
  const token = /data-host-session-token="([^"]+)"/.exec(html)?.[1];
  const cookie = root.headers.get("set-cookie")?.split(";", 1)[0];
  if (token === undefined || cookie === undefined) {
    throw new Error("Assistant Web Host session evidence is missing");
  }
  const prepared = await fetch(
    `${app.url}/wanex/assistant/resource-delivery/prepare`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wanex-host-session": token,
      },
      body: JSON.stringify({
        sessionId,
        resourceId,
        sha256,
        purpose: "preview",
      }),
    },
  );
  expect(prepared.status).toBe(200);
  const body = (await prepared.json()) as {
    readonly delivery: {
      readonly url: string;
      readonly resourceId: string;
      readonly sha256: string;
      readonly resourceKind: string;
      readonly mediaType: string;
      readonly sizeBytes: number;
    };
  };
  expect(body.delivery).toMatchObject({
    resourceId,
    sha256,
    resourceKind: "image",
    mediaType: "image/png",
  });
  const delivered = await fetch(`${app.url}${body.delivery.url}`, {
    headers: { cookie },
  });
  expect(delivered.status).toBe(200);
  expect(delivered.headers.get("content-type")).toBe("image/png");
  expect(delivered.headers.get("content-length")).toBe(
    String(body.delivery.sizeBytes),
  );
  expect(delivered.headers.get("x-wanex-resource-sha256")).toBe(sha256);
  return new Uint8Array(await delivered.arrayBuffer());
}
