import { createHash } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import {
  type Controller,
  type Snapshot
} from "@wanex/assistant-ui"
import {
  listenWebNodeHost,
  type WebNodeHostServer,
  type WebWindowChrome
} from "../src/web-host/index.js"
import type { LocalAttachmentUploadPort } from "../src/resources/attachment.js"
import {
  createLocalResourceDeliveryPort,
  type LocalResourceDeliveryPort
} from "../src/resources/delivery.js"
import type {
  LocalCapabilitySetupCommands,
  LocalModelCatalogCommands,
  LocalSetupImageGenerationAndContinueResult
} from "../src/model.js"
import type {
  SurfaceClient,
  SurfaceEvent
} from "@wanex/assistant/surface"

const hosts: WebNodeHostServer[] = []
type WebEventSource = Pick<
  SurfaceClient,
  "readSurfaceEvents" | "subscribeSurfaceEvents"
>

afterEach(async () => {
  while (hosts.length > 0) {
    await hosts.pop()?.close()
  }
})

describe("@wanex/assistant-host Web host", () => {
  it("serves the sole browser shell and typed request envelopes over Node HTTP", async () => {
    await withNodeHost(async ({ controller, host }) => {
      const shell = await fetch(`${host.url}/`)
      const html = await shell.text()
      expect(shell.headers.get("set-cookie")).toMatch(
        /^wanex_host_session_[a-f0-9]{16}=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/wanex\/assistant$/
      )
      expect(html).toContain("<!doctype html>")
      expect(html).toContain('<div data-app-root></div>')
      expect(html).not.toContain("data-window-chrome")
      expect(html).toContain("data-app-client")
      expect(html).toContain('data-request-path="/wanex/assistant/request"')
      expect(html).toMatch(/data-host-session-token="[A-Za-z0-9_-]{43}"/)
      expect(html).toContain(
        'data-event-stream-path="/wanex/assistant/events"'
      )
      expect(html).toContain(
        'data-resource-delivery-prepare-path="/wanex/assistant/resource-delivery/prepare"'
      )
      expect(html).toContain('src="/assets/app.js"')
      expect(html).toContain('href="/assets/app.css"')
      expect(html).not.toContain('data-wanex-web="surface"')

      const scriptResponse = await fetch(`${host.url}/assets/app.js`)
      expect(scriptResponse.status).toBe(200)
      expectSecurityHeaders(scriptResponse)
      expect(scriptResponse.headers.get("content-type") ?? "").toContain(
        "text/javascript"
      )
      const script = await scriptResponse.text()
      expect(script).toContain("renderer")
      expect(script).not.toContain("WebDocument")
      expect(script).not.toContain("renderWebHtml")
      expect(script).not.toContain("storeDir")
      expect(script).not.toContain("serviceBin")

      const missingToken = await fetch(
        `${host.url}/wanex/assistant/request`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "web.request",
            operation: "dispatchAction",
            action: { type: "set-layout", input: { layout: "diagnostics" } }
          })
        }
      )
      expect(missingToken.status).toBe(403)
      expect(await missingToken.json()).toMatchObject({
        ok: false,
        error: { code: "host_session_required" }
      })
      expect(controller.snapshot().view.layout).toBe("single")

      const wrongToken = await fetch(
        `${host.url}/wanex/assistant/request`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": "not-the-host-session-token"
          },
          body: JSON.stringify({
            kind: "web.request",
            operation: "dispatchAction",
            action: { type: "set-layout", input: { layout: "diagnostics" } }
          })
        }
      )
      expect(wrongToken.status).toBe(403)
      expect(await wrongToken.json()).toMatchObject({
        ok: false,
        error: { code: "host_session_required" }
      })
      expect(controller.snapshot().view.layout).toBe("single")

      const styleResponse = await fetch(`${host.url}/assets/app.css`)
      expect(styleResponse.status).toBe(200)
      expectSecurityHeaders(styleResponse)
      expect(styleResponse.headers.get("content-type") ?? "").toContain(
        "text/css"
      )
      const stylesheet = await styleResponse.text()
      expect(stylesheet).toContain("--color-canvas")
      expect(stylesheet).toContain("data-ui-copy-state")
      expect(stylesheet).not.toContain("storeDir")
      expect(stylesheet).not.toContain("serviceBin")

      const submitted = await postJson(`${host.url}/wanex/assistant/request`, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "node_host_set_layout",
        action: {
          type: "set-layout",
          input: {
            layout: "split"
          }
        }
      })
      expectSecurityHeaders(submitted.response)
      expect(submitted).toMatchObject({
        kind: "web.response",
        ok: true,
        operation: "dispatchAction",
        requestId: "node_host_set_layout",
        actionResult: {
          ok: true,
          action: "set-layout",
          snapshot: {
              view: {
                layout: "split"
              }
            }
        }
      })
      expect(controller.snapshot().view.layout).toBe("split")

      const invalid = await postJson(`${host.url}/wanex/assistant/request`, {
        kind: "web.request",
        operation: "reconcileEvents",
        input: {
          limit: 0
        }
      })
      expect(invalid).toMatchObject({
        kind: "web.response",
        ok: false,
        operation: "reconcileEvents",
        error: {
          code: "invalid_request",
          field: "input.limit"
        },
        snapshot: {
          view: {
            layout: "split"
          }
        }
      })

      const missing = await fetch(`${host.url}/missing`)
      expect(missing.status).toBe(404)
      expectSecurityHeaders(missing)
      expect(await missing.json()).toMatchObject({
        ok: false,
        error: {
          code: "not_found"
        }
      })
    })
  })

  it("marks the document when macOS owns integrated window chrome", async () => {
    await withNodeHost(async ({ host }) => {
      const response = await fetch(`${host.url}/`)
      const html = await response.text()

      expect(html).toContain(
        '<html lang="en" data-window-chrome="integrated-macos">'
      )
    }, { windowChrome: "integrated-macos" })
  })

  it("injects a custom request path while retaining one browser asset graph", async () => {
    await withNodeHost(
      async ({ host }) => {
        const html = await fetchText(`${host.url}/`)
        expect(html).toContain('src="/assets/app.js"')
        expect(html).toContain('href="/assets/app.css"')
        expect(html).toContain('data-request-path="/api/wanex/assistant"')
        expect(html).toContain(
          'data-event-stream-path="/wanex/assistant/events"'
        )

        const scriptResponse = await fetch(`${host.url}/assets/app.js`)
        expect(scriptResponse.status).toBe(200)

        const stylesheetResponse = await fetch(`${host.url}/assets/app.css`)
        expect(stylesheetResponse.status).toBe(200)

        const submitted = await postJson(`${host.url}/api/wanex/assistant`, {
          kind: "web.request",
          operation: "dispatchAction",
          action: {
            type: "set-layout",
            input: {
              layout: "diagnostics"
            }
          }
        })
        expect(submitted).toMatchObject({
          kind: "web.response",
          ok: true,
          operation: "dispatchAction",
          actionResult: {
            snapshot: {
                view: {
                  layout: "diagnostics"
                }
              }
          }
        })
      },
      {
        requestPath: "/api/wanex/assistant"
      }
    )
  })

  it("serves only the fixed caller-supplied browser asset pair", async () => {
    await withNodeHost(async ({ host }) => {
      const script = await fetchText(`${host.url}/assets/app.js`)
      const stylesheet = await fetchText(`${host.url}/assets/app.css`)

      expect(script).toBe("custom-client")
      expect(stylesheet).toBe("custom-stylesheet")
      await expect(fetch(`${host.url}/assets/other.js`)).resolves.toMatchObject({
        status: 404
      })
    }, {
      browserAssets: {
        clientScript: "custom-client",
        stylesheet: "custom-stylesheet"
      }
    })
  })

  it("exposes only an authenticated parameterless model catalog refresh", async () => {
    let refreshes = 0
    let suggestions = {
      kind: "assistant-host.conversation-model-suggestions" as const,
      providers: {
        openai: ["gpt-before-refresh"],
        anthropic: ["claude-before-refresh"],
        deepseek: ["deepseek-before-refresh"]
      }
    }
    const modelCatalog: LocalModelCatalogCommands = {
      readConversationModelSuggestions() {
        return suggestions
      },
      async refresh() {
        refreshes += 1
        suggestions = {
          kind: "assistant-host.conversation-model-suggestions",
          providers: {
            openai: ["gpt-after-refresh"],
            anthropic: ["claude-after-refresh"],
            deepseek: ["deepseek-after-refresh"]
          }
        }
        return {
          kind: "assistant-host.model-catalog.refreshed",
          revision: "sha256:" + "a".repeat(64),
          providerCount: 3,
          modelCount: 74
        }
      }
    }
    await withNodeHost(async ({ host }) => {
      const html = await fetchText(`${host.url}/`)
      expect(html).toContain(
        'data-model-catalog-refresh-path="/wanex/assistant/model-catalog-refresh"'
      )
      const path = `${host.url}/wanex/assistant/model-catalog-refresh`

      const unauthenticated = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      })
      expect(unauthenticated.status).toBe(403)
      expect(refreshes).toBe(0)

      const token = await readHostSessionToken(host.url)
      const forged = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": token
        },
        body: JSON.stringify({ url: "https://attacker.example.test" })
      })
      expect(forged.status).toBe(400)
      await expect(forged.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_model_catalog_refresh" }
      })
      expect(refreshes).toBe(0)

      const refreshed = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": token
        },
        body: "{}"
      })
      expect(refreshed.status).toBe(200)
      await expect(refreshed.json()).resolves.toMatchObject({
        ok: true,
        kind: "web.model-catalog-refresh-response",
        refresh: {
          kind: "assistant-host.model-catalog.refreshed",
          modelCount: 74
        },
        suggestions: {
          kind: "assistant-host.conversation-model-suggestions",
          providers: {
            openai: ["gpt-after-refresh"]
          }
        }
      })
      expect(refreshes).toBe(1)
    }, { modelCatalog })
  })

  it("authenticates the event stream and rejects malformed cursors", async () => {
    await withNodeHost(async ({ host }) => {
      const eventUrl = `${host.url}/wanex/assistant/events`
      const missingToken = await fetch(eventUrl)
      expect(missingToken.status).toBe(403)
      expect(await missingToken.json()).toMatchObject({
        ok: false,
        error: { code: "host_session_required" }
      })

      const wrongToken = await fetch(eventUrl, {
        headers: { "x-wanex-host-session": "wrong-token" }
      })
      expect(wrongToken.status).toBe(403)
      expect(await wrongToken.json()).toMatchObject({
        ok: false,
        error: { code: "host_session_required" }
      })

      const hostSessionToken = await readHostSessionToken(host.url)
      const malformedCursor = await fetch(eventUrl, {
        headers: {
          "x-wanex-host-session": hostSessionToken,
          "last-event-id": "not a valid cursor"
        }
      })
      expect(malformedCursor.status).toBe(400)
      expect(await malformedCursor.json()).toMatchObject({
        ok: false,
        error: { code: "invalid_event_cursor" }
      })

      const wrongMethod = await fetch(eventUrl, {
        method: "POST",
        headers: { "x-wanex-host-session": hostSessionToken }
      })
      expect(wrongMethod.status).toBe(405)
      expect(await wrongMethod.json()).toMatchObject({
        ok: false,
        error: { code: "method_not_allowed" }
      })
    })
  })

  it("replays retained events from Last-Event-ID and cleans up on disconnect", async () => {
    let readRequest: unknown
    let unsubscribeCount = 0
    const event = surfaceEvent(5)
    const surfaceEvents: WebEventSource = {
      async readSurfaceEvents(request) {
        readRequest = request
        return {
          ok: true,
          streamId: "test_surface_stream",
          earliestSequence: 4,
          latestSequence: 5,
          gap: false,
          hasMore: false,
          events: [event]
        }
      },
      subscribeSurfaceEvents() {
        return () => {
          unsubscribeCount += 1
        }
      }
    }
    await withNodeHost(
      async ({ host }) => {
        const hostSessionToken = await readHostSessionToken(host.url)
        const abort = new AbortController()
        const response = await fetch(
          `${host.url}/wanex/assistant/events`,
          {
            headers: {
              accept: "text/event-stream",
              "x-wanex-host-session": hostSessionToken,
              "last-event-id": "test_surface_stream:4"
            },
            signal: abort.signal
          }
        )
        expect(response.status).toBe(200)
        expectSecurityHeaders(response)
        expect(response.headers.get("content-type")).toContain(
          "text/event-stream"
        )
        expect(response.headers.get("cache-control")).toBe("no-store")
        expect(response.headers.get("x-accel-buffering")).toBe("no")
        const reader = response.body?.getReader()
        expect(reader).toBeDefined()
        const chunk = await reader!.read()
        expect(chunk.done).toBe(false)
        const frame = new TextDecoder().decode(chunk.value)
        expect(frame).toContain("id: test_surface_stream:5")
        expect(frame).toContain("event: surface_event")
        expect(frame).toContain(
          "assistant.surface.conversation.operation-invalidated"
        )
        expect(frame).not.toContain(hostSessionToken)
        expect(readRequest).toEqual({
          streamId: "test_surface_stream",
          afterSequence: 4,
          limit: 64
        })

        abort.abort()
        await reader!.cancel().catch(() => {})
        await waitUntil(() => unsubscribeCount === 1)
      },
      { surfaceEvents }
    )
  })

  it("emits an explicit reset when the replay cursor has a gap", async () => {
    const surfaceEvents: WebEventSource = {
      async readSurfaceEvents() {
        return {
          ok: true,
          streamId: "replacement_stream",
          earliestSequence: 7,
          latestSequence: 9,
          gap: true,
          hasMore: false,
          events: []
        }
      },
      subscribeSurfaceEvents() {
        return () => {}
      }
    }
    await withNodeHost(
      async ({ host }) => {
        const hostSessionToken = await readHostSessionToken(host.url)
        const abort = new AbortController()
        const response = await fetch(
          `${host.url}/wanex/assistant/events`,
          {
            headers: {
              "x-wanex-host-session": hostSessionToken,
              "last-event-id": "stale_stream:2"
            },
            signal: abort.signal
          }
        )
        const reader = response.body?.getReader()
        const chunk = await reader!.read()
        const frame = new TextDecoder().decode(chunk.value)
        expect(frame).toContain("event: surface_reset")
        expect(frame).toContain('"reason":"gap"')
        expect(frame).toContain('"streamId":"replacement_stream"')
        expect(frame).toContain('"earliestSequence":7')
        expect(frame).toContain('"latestSequence":9')
        abort.abort()
        await reader!.cancel().catch(() => {})
      },
      { surfaceEvents }
    )
  })

  it("reports a live sequence discontinuity as a gap", async () => {
    let listener: ((event: SurfaceEvent) => void) | undefined
    const surfaceEvents: WebEventSource = {
      async readSurfaceEvents() {
        return {
          ok: true,
          streamId: "test_surface_stream",
          earliestSequence: 1,
          latestSequence: 1,
          gap: false,
          hasMore: false,
          events: [surfaceEvent(1)]
        }
      },
      subscribeSurfaceEvents(next) {
        listener = next
        return () => {}
      }
    }
    await withNodeHost(
      async ({ host }) => {
        const hostSessionToken = await readHostSessionToken(host.url)
        const response = await fetch(
          `${host.url}/wanex/assistant/events`,
          {
            headers: {
              "x-wanex-host-session": hostSessionToken,
              "last-event-id": "test_surface_stream:0"
            }
          }
        )
        const reader = response.body?.getReader()
        expect(reader).toBeDefined()
        const replay = new TextDecoder().decode((await reader!.read()).value)
        expect(replay).toContain("id: test_surface_stream:1")
        expect(listener).toBeDefined()

        listener!(surfaceEvent(3))
        const reset = new TextDecoder().decode((await reader!.read()).value)
        expect(reset).toContain("event: surface_reset")
        expect(reset).toContain('"reason":"gap"')
        expect(reset).toContain('"latestSequence":1')
      },
      { surfaceEvents }
    )
  })

  it("closes active event streams before the Node host closes", async () => {
    const host = await listenWebNodeHost({
      controller: createFakeController(),
      surfaceEvents: emptySurfaceEvents(),
      attachments: {
        async uploadAttachment() {
          throw new Error("attachment upload was not configured for this test")
        }
      },
      resourceDeliveries: unconfiguredResourceDeliveries()
    })
    hosts.push(host)
    const hostSessionToken = await readHostSessionToken(host.url)
    const response = await fetch(
      `${host.url}/wanex/assistant/events`,
      {
        headers: { "x-wanex-host-session": hostSessionToken }
      }
    )
    expect(response.status).toBe(200)

    await expect(
      Promise.race([
        host.close(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("host close timed out")), 1_000)
        })
      ])
    ).resolves.toBeUndefined()
    hosts.splice(hosts.indexOf(host), 1)
  })

  it("force-closes active loopback requests during Node host shutdown", async () => {
    const host = await listenWebNodeHost({
      controller: createFakeController(),
      surfaceEvents: emptySurfaceEvents(),
      attachments: {
        async uploadAttachment() {
          throw new Error("attachment upload was not configured for this test")
        }
      },
      resourceDeliveries: unconfiguredResourceDeliveries()
    })
    hosts.push(host)
    const address = host.server.address()
    if (address === null || typeof address === "string") {
      throw new Error("test Assistant host did not expose a TCP address")
    }
    const accepted = new Promise<void>((resolve) => {
      host.server.once("connection", () => resolve())
    })
    const { createConnection } = await import("node:net")
    const socket = createConnection({ host: "127.0.0.1", port: address.port })
    const socketClosed = new Promise<void>((resolve) => {
      socket.once("error", () => {
        // Forced host shutdown may surface ECONNRESET before the close event.
      })
      socket.once("close", () => resolve())
    })
    await accepted
    socket.write([
      "POST /wanex/assistant/request HTTP/1.1",
      "Host: 127.0.0.1",
      "Content-Type: application/json",
      "Content-Length: 100",
      "Connection: keep-alive",
      "",
      "{"
    ].join("\r\n"))

    await expect(
      Promise.race([
        host.close(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("host close timed out")), 1_000)
        })
      ])
    ).resolves.toBeUndefined()
    hosts.splice(hosts.indexOf(host), 1)
    await expect(
      Promise.race([
        socketClosed,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("client socket close timed out")), 1_000)
        })
      ])
    ).resolves.toBeUndefined()
    expect(socket.destroyed).toBe(true)
  })

  it("keeps binary attachment upload separate from the JSON command port", async () => {
    const uploaded: Uint8Array[] = []
    const attachments: LocalAttachmentUploadPort = {
      async uploadAttachment(request) {
        uploaded.push(request.content)
        return {
          kind: "assistant-host.attachment-uploaded",
          attachment: {
            kind: "assistant.attachment",
            resourceId: "res_http_attachment",
            resourceKind: "image",
            previewKind: "image",
            state: "available",
            sizeBytes: request.content.byteLength,
            sha256: "a".repeat(64),
            mediaType: request.mediaType,
            ...(request.label === undefined ? {} : { label: request.label }),
            addedAt: 1
          },
          attachments: {
            kind: "assistant.conversation-attachments",
            draftKey: "__new__",
            attachments: []
          }
        }
      }
    }
    await withNodeHost(
      async ({ host }) => {
        const missingToken = await fetch(
          `${host.url}/wanex/assistant/attachment`,
          {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: new Uint8Array([1, 2])
          }
        )
        expect(missingToken.status).toBe(403)
        expect(await missingToken.json()).toMatchObject({
          ok: false,
          error: { code: "host_session_required" }
        })
        expect(uploaded).toEqual([])

        const wrongToken = await fetch(
          `${host.url}/wanex/assistant/attachment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-wanex-host-session": "not-the-host-session-token"
            },
            body: new Uint8Array([1, 2])
          }
        )
        expect(wrongToken.status).toBe(403)
        expect(await wrongToken.json()).toMatchObject({
          ok: false,
          error: { code: "host_session_required" }
        })
        expect(uploaded).toEqual([])

        const hostSessionToken = await readHostSessionToken(host.url)
        const response = await fetch(
          `${host.url}/wanex/assistant/attachment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-wanex-host-session": hostSessionToken,
              "x-wanex-media-type": encodeURIComponent("image/png"),
              "x-wanex-attachment-label": encodeURIComponent("test.png")
            },
            body: new Uint8Array([1, 2])
          }
        )
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({
          ok: true,
          kind: "web.attachment-upload-response",
          upload: {
            attachment: {
              resourceId: "res_http_attachment",
              label: "test.png"
            }
          }
        })
        expect(Array.from(uploaded[0] ?? [])).toEqual([1, 2])

        const unsupported = await fetch(
          `${host.url}/wanex/assistant/attachment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-wanex-host-session": hostSessionToken
            },
            body: "{}"
          }
        )
        expect(unsupported.status).toBe(415)
        expect(await unsupported.json()).toMatchObject({
          ok: false,
          error: { code: "unsupported_media_type" }
        })

        const oversized = await fetch(
          `${host.url}/wanex/assistant/attachment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-wanex-host-session": hostSessionToken,
              "x-wanex-media-type": encodeURIComponent("image/png")
            },
            body: new Uint8Array([1, 2, 3])
          }
        )
        expect(oversized.status).toBe(413)
        expect(await oversized.json()).toMatchObject({
          ok: false,
          error: { code: "attachment_too_large" }
        })
      },
      { attachments, maxAttachmentBytes: 2 }
    )
  })

  it("protects and bounds trusted capability setup requests", async () => {
    const requests: unknown[] = []
    const capabilitySetup: LocalCapabilitySetupCommands = {
      async setupImageGenerationAndContinue(request) {
        requests.push(request)
        if (request.imageGenerationModelId === "reject-model") {
          return {
            kind: "assistant-host.capability-setup.rejected",
            reason: "operation_not_current",
            message: "The capability request is no longer current"
          }
        }
        return successfulCapabilitySetup(request)
      }
    }

    await withNodeHost(
      async ({ host }) => {
        const path = "/wanex/assistant/capability-setup"
        const valid = {
          operationId: "operation_http_capability",
          sessionId: "session_http_capability",
          operation: "image.generate",
          imageGenerationModelId: "gpt-image-http"
        }

        const wrongMethod = await fetch(`${host.url}${path}`)
        expect(wrongMethod.status).toBe(405)
        expect(await wrongMethod.json()).toMatchObject({
          ok: false,
          error: { code: "method_not_allowed" }
        })

        const missingToken = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(valid)
        })
        expect(missingToken.status).toBe(403)
        expect(await missingToken.json()).toMatchObject({
          ok: false,
          error: { code: "host_session_required" }
        })

        const wrongToken = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": "wrong-host-token"
          },
          body: JSON.stringify(valid)
        })
        expect(wrongToken.status).toBe(403)
        expect(await wrongToken.json()).toMatchObject({
          ok: false,
          error: { code: "host_session_required" }
        })
        expect(requests).toEqual([])

        const hostSessionToken = await readHostSessionToken(host.url)
        const unknownField = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": hostSessionToken
          },
          body: JSON.stringify({ ...valid, secretRef: "must-not-be-accepted" })
        })
        expect(unknownField.status).toBe(400)
        expect(await unknownField.json()).toMatchObject({
          ok: false,
          error: { code: "invalid_capability_setup" }
        })

        const unsupportedOperation = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": hostSessionToken
          },
          body: JSON.stringify({ ...valid, operation: "video.generate" })
        })
        expect(unsupportedOperation.status).toBe(400)
        expect(await unsupportedOperation.json()).toMatchObject({
          ok: false,
          error: { code: "invalid_capability_setup" }
        })
        expect(requests).toEqual([])

        const rejected = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": hostSessionToken
          },
          body: JSON.stringify({
            ...valid,
            imageGenerationModelId: "reject-model"
          })
        })
        expect(rejected.status).toBe(409)
        const rejectedBody = await rejected.json()
        expect(rejectedBody).toMatchObject({
          ok: false,
          kind: "web.capability-setup-response",
          error: {
            code: "operation_not_current",
            message: "The capability request is no longer current"
          },
          snapshot: { kind: "web.snapshot" }
        })
        expect(JSON.stringify(rejectedBody)).not.toContain("secretRef")

        const succeeded = await fetch(`${host.url}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wanex-host-session": hostSessionToken
          },
          body: JSON.stringify(valid)
        })
        expect(succeeded.status).toBe(200)
        expectSecurityHeaders(succeeded)
        const succeededBody = await succeeded.json()
        expect(succeededBody).toMatchObject({
          ok: true,
          kind: "web.capability-setup-response",
          setup: {
            kind: "assistant-host.capability-setup.continued",
            setup: {
              endpoint: {
                id: "openai.image-generate",
                credentialConfigured: true
              },
              readiness: { status: "ready" }
            },
            operation: {
              operation: {
                operationId: "operation_http_capability_linked"
              }
            }
          },
          snapshot: { kind: "web.snapshot" }
        })
        const serialized = JSON.stringify(succeededBody)
        expect(serialized).not.toContain("secretRef")
        expect(serialized).not.toContain("must-not-be-accepted")
        expect(serialized).not.toContain("credential-value")
        expect(requests).toEqual([
          { ...valid, imageGenerationModelId: "reject-model" },
          valid
        ])
      },
      { capabilitySetup }
    )
  })

  it("prepares opaque resource delivery and serves GET, HEAD, and one byte Range", async () => {
    const content = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const sha256 = createHash("sha256").update(content).digest("hex")
    const reads: unknown[] = []
    const resourceDeliveries = createLocalResourceDeliveryPort({
      async readResource(request) {
        reads.push(request)
        return {
          id: request.resourceId,
          logicalPath: "resources/http-preview.png",
          kind: "image",
          origin: "model_output",
          state: "available",
          mediaType: "image/png",
          sizeBytes: content.byteLength,
          sha256,
          createdAt: 1,
          updatedAt: 1
        }
      },
      async readResourceContent(request) {
        reads.push(request)
        const bytes = content.slice(request.offset, request.offset + request.limit)
        return {
          resourceId: request.resourceId,
          sha256,
          totalSizeBytes: content.byteLength,
          offset: request.offset,
          content: bytes,
          eof: request.offset + bytes.byteLength === content.byteLength
        }
      }
    }, {
      authorizer: { authorize: async () => true }
    })

    await withNodeHost(async ({ host }) => {
      const preparePath = "/wanex/assistant/resource-delivery/prepare"
      const prepareBody = {
        resourceId: "res_http_preview",
        sha256,
        purpose: "preview",
        sessionId: "session_http_preview"
      }
      const missingToken = await fetch(`${host.url}${preparePath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepareBody)
      })
      expect(missingToken.status).toBe(403)
      expect(await missingToken.json()).toMatchObject({
        ok: false,
        error: { code: "host_session_required" }
      })
      expect(reads).toEqual([])

      const hostSessionToken = await readHostSessionToken(host.url)
      const wrongMethod = await fetch(`${host.url}${preparePath}`, {
        headers: { "x-wanex-host-session": hostSessionToken }
      })
      expect(wrongMethod.status).toBe(405)
      expect(await wrongMethod.json()).toMatchObject({
        error: { code: "method_not_allowed" }
      })
      expect(reads).toEqual([])

      const missingEvidence = await fetch(`${host.url}${preparePath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": hostSessionToken
        },
        body: JSON.stringify({ resourceId: "res_http_preview", purpose: "preview" })
      })
      expect(missingEvidence.status).toBe(400)
      expect(await missingEvidence.json()).toMatchObject({
        error: { code: "invalid_resource_delivery" }
      })
      expect(reads).toEqual([])

      const prepared = await fetch(`${host.url}${preparePath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": hostSessionToken
        },
        body: JSON.stringify(prepareBody)
      })
      expect(prepared.status).toBe(200)
      const preparedBody = await prepared.json() as {
        readonly delivery: { readonly url: string; readonly sha256: string }
      }
      expect(preparedBody.delivery.sha256).toBe(sha256)
      expect(preparedBody.delivery.url).toMatch(
        /^\/wanex\/assistant\/resource-delivery\?token=wrd_[A-Za-z0-9_-]{43}$/
      )
      const deliveryUrl = `${host.url}${preparedBody.delivery.url}`
      const missingCookie = await fetch(deliveryUrl)
      expect(missingCookie.status).toBe(403)
      const cookie = await readHostSessionCookie(host.url)
      const response = await fetch(deliveryUrl, {
        headers: { cookie }
      })
      expect(response.status).toBe(200)
      expectSecurityHeaders(response)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("content-length")).toBe(String(content.byteLength))
      expect(response.headers.get("x-wanex-resource-sha256")).toBe(sha256)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.get("accept-ranges")).toBe("bytes")
      expect(response.headers.get("etag")).toBe(`"sha256-${sha256}"`)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(content)
      const head = await fetch(deliveryUrl, {
        method: "HEAD",
        headers: { cookie }
      })
      expect(head.status).toBe(200)
      expect(head.headers.get("content-length")).toBe(String(content.byteLength))
      const range = await fetch(deliveryUrl, {
        headers: { cookie, range: "bytes=1-3" }
      })
      expect(range.status).toBe(206)
      expect(range.headers.get("content-range")).toBe(`bytes 1-3/${content.byteLength}`)
      expect(new Uint8Array(await range.arrayBuffer())).toEqual(content.slice(1, 4))
      const multiple = await fetch(deliveryUrl, {
        headers: { cookie, range: "bytes=0-1,4-5" }
      })
      expect(multiple.status).toBe(416)
      expect(multiple.headers.get("content-range")).toBe(`bytes */${content.byteLength}`)
      const releaseWithoutHeader = await fetch(deliveryUrl, {
        method: "DELETE",
        headers: { cookie }
      })
      expect(releaseWithoutHeader.status).toBe(403)
      const releaseWithoutCookie = await fetch(deliveryUrl, {
        method: "DELETE",
        headers: { "x-wanex-host-session": hostSessionToken }
      })
      expect(releaseWithoutCookie.status).toBe(403)
      const released = await fetch(deliveryUrl, {
        method: "DELETE",
        headers: {
          cookie,
          "x-wanex-host-session": hostSessionToken
        }
      })
      expect(released.status).toBe(204)
      expect(await released.text()).toBe("")
      const releasedAgain = await fetch(deliveryUrl, {
        method: "DELETE",
        headers: {
          cookie,
          "x-wanex-host-session": hostSessionToken
        }
      })
      expect(releasedAgain.status).toBe(204)
      const afterRelease = await fetch(deliveryUrl, { headers: { cookie } })
      expect(afterRelease.status).toBe(404)
      expect(reads).toHaveLength(3)
    }, { resourceDeliveries })
  })

  it("does not retain the former isolated browser proof route", async () => {
    await withNodeHost(async ({ host }) => {
      const response = await fetch(`${host.url}/__unknown-route__`)
      expect(response.status).toBe(404)
      expectSecurityHeaders(response)
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "not_found" }
      })
    })
  })
})

async function withNodeHost(
  run: (context: {
    readonly controller: Controller
    readonly host: WebNodeHostServer
  }) => Promise<void>,
  options: {
    readonly requestPath?: string
    readonly eventStreamPath?: string
    readonly surfaceEvents?: WebEventSource
    readonly maxAttachmentBytes?: number
    readonly attachments?: LocalAttachmentUploadPort
    readonly resourceDeliveries?: LocalResourceDeliveryPort
    readonly capabilitySetup?: LocalCapabilitySetupCommands
    readonly modelCatalog?: LocalModelCatalogCommands
    readonly browserAssets?: {
      readonly clientScript: string
      readonly stylesheet: string
    }
    readonly windowChrome?: WebWindowChrome
  } = {}
): Promise<void> {
  const controller = createFakeController()
  const host = await listenWebNodeHost({
    controller,
    surfaceEvents: emptySurfaceEvents(),
    attachments: {
      async uploadAttachment() {
        throw new Error("attachment upload was not configured for this test")
      }
    },
    resourceDeliveries: unconfiguredResourceDeliveries(),
    ...options
  })
  hosts.push(host)
  await run({ controller, host })
}

function successfulCapabilitySetup(request: {
  readonly operationId: string
  readonly sessionId: string
  readonly operation: "image.generate"
  readonly imageGenerationModelId: string
}): LocalSetupImageGenerationAndContinueResult {
  const endpoint = {
    id: "openai.image-generate",
    connection: { id: "openai", providerId: "openai" },
    protocol: { id: "openai-images" },
    model: {
      id: request.imageGenerationModelId,
      operations: ["image.generate" as const],
      inputModalities: ["text" as const],
      outputModalities: ["image" as const],
      features: [],
      catalog: {
        source: "custom" as const,
        catalogId: `test.${request.imageGenerationModelId}`,
        revision: "1"
      }
    },
    credentialConfigured: true,
    active: false
  }
  return {
    kind: "assistant-host.capability-setup.continued",
    setup: {
      kind: "assistant-host.image-generation-capability.configured",
      endpoint,
      readiness: {
        requirement: {
          operation: "image.generate",
          inputModalities: ["text"],
          outputModalities: ["image"],
          features: []
        },
        status: "ready",
        reason: "image generation is ready",
        candidates: [endpoint],
        candidatesTruncated: false,
        selectedEndpoint: endpoint,
        selectedSource: "configured",
        recommendedModelEndpointId: endpoint.id
      }
    },
    operation: {
      kind: "assistant.conversation-operation.found",
      operation: {
        kind: "assistant.conversation-operation",
        operationId: `${request.operationId}_linked`,
        sessionId: request.sessionId,
        state: "queued",
        createdAt: 1,
        updatedAt: 1,
        transcript: { rows: [], totalRows: 0, truncated: false },
        capabilities: {
          steerable: false,
          cancellable: true,
          regeneratable: false,
          terminal: false
        }
      }
    }
  }
}

function unconfiguredResourceDeliveries(): LocalResourceDeliveryPort {
  return {
    async prepare() {
      throw new Error("resource delivery was not configured for this test")
    },
    async open() {
      throw new Error("resource delivery was not configured for this test")
    },
    revoke() { return false },
    close() {},
    activeGrantCount() { return 0 }
  }
}

function createFakeController(): Controller {
  let layout = "single"
  const snapshot = (): Snapshot => {
    return {
      kind: "web.snapshot",
      generatedAt: 1,
      eventCursor: 0,
      diagnostics: [],
      descriptor: { ok: true },
      status: { ok: true },
      home: { ok: true },
      events: { ok: true, events: [] },
      view: {
        title: "Wanex assistant",
        ready: true,
        mode: "chat",
        layout,
        theme: "system",
        density: "comfortable",
        settings: {
          profile: {
            configuredModelEndpointId: "fake-profile",
            activeModelEndpointId: "fake-profile",
            agentContextConfigured: false,
            agentContextRevision: 0
          },
          renderer: {
            layout,
            mode: "chat",
            theme: "system",
            density: "comfortable",
            availableLayouts: ["single", "split", "diagnostics"],
            availableModes: ["chat", "workbench", "diagnostics"],
            availableThemes: ["system", "light", "dark"],
            availableDensities: ["comfortable", "compact"]
          },
          privacy: {
            exposesStorePath: false,
            exposesServiceBinaryPath: false,
            exposesSecrets: false
          },
          integration: {
            rendererCalls: "app-owned-ipc-or-api",
            rendererMayOpenStorage: false,
            rendererMayReceiveStorePath: false,
            rendererMayReceiveServiceBinaryPath: false
          }
        },
        commandCount: 0,
        eventCount: 0,
        diagnostics: [],
        actions: []
      }
    } as unknown as Snapshot
  }

  return {
    snapshot() {
      return snapshot()
    },
    async refresh() {
      return snapshot()
    },
    async reconcileEvents() {
      return snapshot()
    },
    async dispatchAction(action) {
      if (action.type === "set-layout") {
        layout = action.input.layout
      }
      return {
        ok: true,
        action: action.type,
        snapshot: snapshot()
      } as const
    }
  }
}

function emptySurfaceEvents(): WebEventSource {
  return {
    async readSurfaceEvents() {
      return {
        ok: true,
        streamId: "test_surface_stream",
        earliestSequence: 1,
        latestSequence: 0,
        gap: false,
        hasMore: false,
        events: []
      }
    },
    subscribeSurfaceEvents() {
      return () => {}
    }
  }
}

function surfaceEvent(sequence: number): SurfaceEvent {
  return {
    id: `test_surface_stream:${sequence}`,
    sequence,
    type: "assistant.surface.conversation.operation-invalidated",
    command: "conversation.readTrackedConversationOperation",
    at: sequence,
    conversation: {
      kind: "assistant.conversation.operation-invalidated",
      sequence,
      at: sequence,
      operationId: "operation_host_test",
      sessionId: "session_host_test",
      cause: "execution_completed"
    }
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for host state")
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expectSecurityHeaders(response)
  return await response.text()
}

type JsonWithResponse<T extends object> = T & {
  readonly response: Response
}

async function postJson<T extends object = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<JsonWithResponse<T>> {
  const hostSessionToken = await readHostSessionToken(url)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  const json = (await response.json()) as T
  return Object.assign(json, { response }) as JsonWithResponse<T>
}

async function readHostSessionToken(url: string): Promise<string> {
  const root = new URL("/", url)
  const html = await fetchText(root.toString())
  const match = /data-host-session-token="([^"]+)"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("assistant host document did not include a session token")
  }
  return match[1]
}

async function readHostSessionCookie(url: string): Promise<string> {
  const response = await fetch(new URL("/", url))
  const setCookie = response.headers.get("set-cookie")
  const cookie = setCookie?.split(";", 1)[0]
  if (cookie === undefined || !/^wanex_host_session_[a-f0-9]{16}=/.test(cookie)) {
    throw new Error("assistant Host shell did not set its session cookie")
  }
  return cookie
}

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  expect(response.headers.get("x-frame-options")).toBe("DENY")
  expect(response.headers.get("cross-origin-resource-policy")).toBe(
    "same-origin"
  )
  expect(response.headers.get("permissions-policy")).toBe(
    "camera=(), microphone=(), geolocation=()"
  )
  const csp = response.headers.get("content-security-policy") ?? ""
  expect(csp).toContain("default-src 'none'")
  expect(csp).toContain("connect-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
}
