import { afterEach, describe, expect, it } from "vitest"
import {
  parseProductAppWebActionInput,
  type ProductAppWebController,
  type ProductAppWebDocument,
  type ProductAppWebSnapshot
} from "@wanex/product-app-web"
import {
  listenProductAppWebNodeHost,
  type ProductAppWebNodeHostServer
} from "../src/web-host/index.js"

const hosts: ProductAppWebNodeHostServer[] = []

afterEach(async () => {
  while (hosts.length > 0) {
    await hosts.pop()?.close()
  }
})

describe("@wanex/product-app-local Web host", () => {
  it("serves Product App Web documents and request envelopes over Node HTTP", async () => {
    await withNodeHost(async ({ controller, host }) => {
      const html = await fetchText(`${host.url}/`)
      expect(html).toContain("<!doctype html>")
      expect(html).toContain('data-wanex-product-app-web="surface"')
      expect(html).toContain("data-wanex-product-app-web-shell")
      expect(html).toContain("data-wanex-product-app-web-client")
      expect(html).toContain("data-wanex-product-app-web-stylesheet")
      expect(html).toContain('data-request-path="/wanex/product-app-web/request"')
      expect(html).toContain('data-poll-interval-ms="2000"')
      expect(html).toContain('src="/wanex/product-app-web/client.js"')
      expect(html).toContain('href="/wanex/product-app-web/styles.css"')
      expect(html).toContain("<h1>Wanex Product App</h1>")

      const scriptResponse = await fetch(`${host.url}/wanex/product-app-web/client.js`)
      expect(scriptResponse.status).toBe(200)
      expectSecurityHeaders(scriptResponse)
      expect(scriptResponse.headers.get("content-type") ?? "").toContain(
        "text/javascript"
      )
      const script = await scriptResponse.text()
      expect(script).toContain('operation: "submitActionInput"')
      expect(script).toContain('operation: "pollEvents"')
      expect(script).toContain("new FormData(form)")
      expect(script).toContain("replaceSurface(payload.document.html)")
      expect(script).toContain("captureScrollState()")
      expect(script).toContain("restoreScrollState(scrollState)")
      expect(script).toContain("window.scrollTo(scrollState.x, scrollState.y)")
      expect(script).not.toContain("storeDir")
      expect(script).not.toContain("serviceBin")

      const styleResponse = await fetch(`${host.url}/wanex/product-app-web/styles.css`)
      expect(styleResponse.status).toBe(200)
      expectSecurityHeaders(styleResponse)
      expect(styleResponse.headers.get("content-type") ?? "").toContain(
        "text/css"
      )
      const stylesheet = await styleResponse.text()
      expect(stylesheet).toContain('[data-wanex-product-app-web="surface"]')
      expect(stylesheet).toContain('[data-region="workspace"]')
      expect(stylesheet).not.toContain("storeDir")
      expect(stylesheet).not.toContain("serviceBin")

      const submitted = await postJson(`${host.url}/wanex/product-app-web/request`, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "node_host_set_layout",
        input: {
          action: "set-layout",
          fields: {
            layout: "split"
          }
        },
        options: {
          pollAfterAction: {
            limit: 2
          }
        }
      })
      expectSecurityHeaders(submitted.response)
      expect(submitted).toMatchObject({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        requestId: "node_host_set_layout",
        document: {
          snapshot: {
            view: {
              layout: "split"
            }
          }
        },
        submitResult: {
          ok: true,
          actionResult: {
            ok: true,
            action: "set-layout"
          }
        }
      })
      expect(controller.snapshot().view.layout).toBe("split")

      const invalid = await postJson(`${host.url}/wanex/product-app-web/request`, {
        kind: "product-app-web.request",
        operation: "pollEvents",
        input: {
          limit: 0
        }
      })
      expect(invalid).toMatchObject({
        kind: "product-app-web.response",
        ok: false,
        operation: "pollEvents",
        error: {
          code: "invalid_request",
          field: "input.limit"
        },
        document: {
          snapshot: {
            view: {
              layout: "split"
            }
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

  it("injects custom request and script paths into the browser shell", async () => {
    await withNodeHost(
      async ({ host }) => {
        const html = await fetchText(`${host.url}/`)
        expect(html).toContain('src="/assets/wanex-client.js"')
        expect(html).toContain('href="/assets/wanex.css"')
        expect(html).toContain('data-request-path="/api/wanex/web"')
        expect(html).toContain('data-poll-interval-ms="0"')

        const scriptResponse = await fetch(`${host.url}/assets/wanex-client.js`)
        expect(scriptResponse.status).toBe(200)

        const stylesheetResponse = await fetch(`${host.url}/assets/wanex.css`)
        expect(stylesheetResponse.status).toBe(200)

        const defaultScriptResponse = await fetch(
          `${host.url}/wanex/product-app-web/client.js`
        )
        expect(defaultScriptResponse.status).toBe(404)
        const defaultStyleResponse = await fetch(
          `${host.url}/wanex/product-app-web/styles.css`
        )
        expect(defaultStyleResponse.status).toBe(404)

        const submitted = await postJson(`${host.url}/api/wanex/web`, {
          kind: "product-app-web.request",
          operation: "submitActionInput",
          input: {
            action: "set-layout",
            fields: {
              layout: "diagnostics"
            }
          }
        })
        expect(submitted).toMatchObject({
          kind: "product-app-web.response",
          ok: true,
          operation: "submitActionInput",
          document: {
            snapshot: {
              view: {
                layout: "diagnostics"
              }
            }
          }
        })
      },
      {
        requestPath: "/api/wanex/web",
        clientScriptPath: "/assets/wanex-client.js",
        stylesheetPath: "/assets/wanex.css",
        pollIntervalMs: 0
      }
    )
  })
})

async function withNodeHost(
  run: (context: {
    readonly controller: ProductAppWebController
    readonly host: ProductAppWebNodeHostServer
  }) => Promise<void>,
  options: {
    readonly requestPath?: string
    readonly clientScriptPath?: string
    readonly stylesheetPath?: string
    readonly pollIntervalMs?: number
  } = {}
): Promise<void> {
  const controller = createFakeController()
  const host = await listenProductAppWebNodeHost({ controller, ...options })
  hosts.push(host)
  await run({ controller, host })
}

function createFakeController(): ProductAppWebController {
  let layout = "single"
  const document = (): ProductAppWebDocument => {
    const snapshot = {
      kind: "product-app-web.snapshot",
      generatedAt: 1,
      eventCursor: 0,
      diagnostics: [],
      descriptor: { ok: true },
      status: { ok: true },
      home: { ok: true },
      events: { ok: true, events: [] },
      view: {
        title: "Wanex Product App",
        ready: true,
        mode: "chat",
        layout,
        theme: "system",
        density: "comfortable",
        settings: {
          profile: {
            configuredProviderProfileId: "fake-profile",
            activeProviderProfileId: "fake-profile",
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
    } as unknown as ProductAppWebSnapshot
    return {
      kind: "product-app-web.document",
      snapshot,
      html: `<section data-wanex-product-app-web="surface"><h1>${snapshot.view.title}</h1><p>${snapshot.view.layout}</p><form data-action="set-layout"><input type="hidden" name="action" value="set-layout"><select name="layout"><option value="single">Single</option><option value="split">Split</option><option value="diagnostics">Diagnostics</option></select><button type="submit">Layout</button></form></section>`
    }
  }

  return {
    snapshot() {
      return document().snapshot
    },
    document,
    async refresh() {
      return document()
    },
    async pollEvents() {
      return document()
    },
    async submitActionInput(input) {
      const parse = parseProductAppWebActionInput(input)
      if (!parse.ok) {
        return {
          ok: false,
          parse,
          document: document()
        }
      }
      if (parse.action.type === "set-layout") {
        layout = parse.action.input.layout
      }
      const actionResult = {
        ok: true,
        action: parse.action.type,
        snapshot: document().snapshot
      } as const
      return {
        ok: true,
        parse,
        actionResult,
        document: document()
      }
    }
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
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  const json = (await response.json()) as T
  return Object.assign(json, { response }) as JsonWithResponse<T>
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
