import { Window } from "happy-dom"
import type {
  HTMLButtonElement,
  HTMLInputElement,
  HTMLSelectElement,
  HTMLTemplateElement
} from "happy-dom"
import { describe, expect, it } from "vitest"
import { PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT } from "../src/web-host/browser-client.js"

const SURFACE_SELECTOR = '[data-wanex-product-app-web="surface"]'

interface FetchCall {
  readonly url: string
  readonly init: {
    readonly method?: string
    readonly headers?: unknown
    readonly body?: unknown
  }
}

describe("Product App Local Web host browser client", () => {
  it("submits rendered action forms through the configured request envelope", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    installDocument(window, {
      requestPath: "/custom/product-app/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<h1>Wanex Product App</h1>`,
        `<p>single</p>`,
        `<form data-action="set-layout">`,
        `<input type="hidden" name="action" value="set-layout">`,
        `<select name="layout">`,
        `<option value="single">Single</option>`,
        `<option value="split" selected>Split</option>`,
        `</select>`,
        `<button type="submit">Layout</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        requestId: "dom_submit",
        submitResult: {
          ok: true
        },
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<h1>Wanex Product App</h1>`,
            `<p data-layout>split</p>`,
            `</section>`
          ].join("")
        }
      })
    })

    installBrowserClient(window)
    submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]?.url).toBe("/custom/product-app/request")
    expect(fetchCalls[0]?.init.method).toBe("POST")
    const body = JSON.parse(String(fetchCalls[0]?.init.body))
    expect(body).toMatchObject({
      kind: "product-app-web.request",
      operation: "submitActionInput",
      input: {
        action: "set-layout",
        fields: {
          layout: "split"
        }
      }
    })
    expect(typeof body.requestId).toBe("string")
    expect(surfaceText(window)).toContain("split")
    expect(surfaceText(window)).not.toContain("single")
  })

  it("restores focus to the relevant settings control after replacing the surface", async () => {
    const window = createWindow()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="update-preferences">`,
        `<input type="hidden" name="action" value="update-preferences">`,
        `<select name="theme">`,
        `<option value="system">System</option>`,
        `<option value="dark" selected>Dark</option>`,
        `</select>`,
        `<select name="density">`,
        `<option value="comfortable">Comfortable</option>`,
        `<option value="compact" selected>Compact</option>`,
        `</select>`,
        `<button type="submit">Apply preferences</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async () =>
      jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface" data-product-theme="dark" data-product-density="compact">`,
            `<form data-action="update-preferences">`,
            `<select name="theme">`,
            `<option value="system">System</option>`,
            `<option value="dark" selected>Dark</option>`,
            `</select>`,
            `<select name="density">`,
            `<option value="comfortable">Comfortable</option>`,
            `<option value="compact" selected>Compact</option>`,
            `</select>`,
            `<button type="submit">Apply preferences</button>`,
            `</form>`,
            `</section>`
          ].join("")
        },
        submitResult: {
          ok: true
        }
      })
    )

    installBrowserClient(window)
    submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    expect(activeElementName(window)).toBe("theme")
  })

  it("restores focus to the selected session button after session selection", async () => {
    const window = createWindow()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="select-session">`,
        `<input type="hidden" name="action" value="select-session">`,
        `<input type="hidden" name="sessionId" value="ses_selected">`,
        `<button type="submit">Select session</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async () =>
      jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<ol data-session-list>`,
            `<li data-session-id="ses_selected" aria-current="true">`,
            `<form data-action="select-session">`,
            `<input type="hidden" name="sessionId" value="ses_selected">`,
            `<button type="submit"><span>Selected session</span></button>`,
            `</form>`,
            `</li>`,
            `</ol>`,
            `</section>`
          ].join("")
        },
        submitResult: {
          ok: true
        }
      })
    )

    installBrowserClient(window)
    submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    expect(window.document.activeElement?.textContent).toContain(
      "Selected session"
    )
  })

  it("renders action parse failures inside the replaced surface", async () => {
    const window = createWindow()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<h1>Wanex Product App</h1>`,
        `<form data-action="set-layout">`,
        `<input name="layout" value="floating">`,
        `<button type="submit">Layout</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async () =>
      jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: `<section data-wanex-product-app-web="surface"><h1>Wanex Product App</h1><p>diagnostics</p></section>`
        },
        submitResult: {
          ok: false,
          parse: {
            ok: false,
            error: {
              code: "invalid_field",
              field: "layout",
              message: "layout must be one of: single, split, diagnostics"
            }
          }
        }
      })
    )

    installBrowserClient(window)
    submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    const alert = window.document.querySelector(
      "[data-wanex-product-app-web-alert]"
    )
    expect(alert?.getAttribute("role")).toBe("alert")
    expect(alert?.textContent).toBe(
      "layout must be one of: single, split, diagnostics"
    )
    expect(window.document.activeElement).toBe(alert)
    expect(
      window.document
        .querySelector(SURFACE_SELECTOR)
        ?.getAttribute("data-wanex-product-app-web-error")
    ).toBe("layout must be one of: single, split, diagnostics")
    expect(surfaceText(window)).toContain("diagnostics")
  })

  it("submits conversation textarea values through the request envelope", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<h1>Wanex Product App</h1>`,
        `<section data-panel="workbench">`,
        `<form data-action="submit-conversation">`,
        `<textarea name="text">hello from textarea</textarea>`,
        `<p-status role="status" aria-live="polite">Ready to send</p>`,
        `<button type="submit">Send</button>`,
        `</form>`,
        `</section>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<p>continued</p>`,
            `<form data-action="submit-conversation">`,
            `<textarea name="text"></textarea>`,
            `<p-status role="status" aria-live="polite">Ready to send</p>`,
            `<button type="submit">Send</button>`,
            `</form>`,
            `</section>`
          ].join("")
        },
        submitResult: {
          ok: true
        }
      })
    })

    installBrowserClient(window)
    const form = submitFirstForm(window)
    expect(
      window.document
        .querySelector(SURFACE_SELECTOR)
        ?.getAttribute("aria-busy")
    ).toBe("true")
    expect((form.querySelector("button") as HTMLButtonElement).disabled).toBe(true)
    await window.happyDOM.whenAsyncComplete()

    expect(fetchCalls).toHaveLength(1)
    const body = JSON.parse(String(fetchCalls[0]?.init.body))
    expect(body).toMatchObject({
      operation: "submitActionInput",
      input: {
        action: "submit-conversation",
        fields: {
          text: "hello from textarea"
        }
      }
    })
    expect(surfaceText(window)).toContain("continued")
    const textarea = window.document.querySelector("textarea") as
      | { readonly value: string }
      | null
    expect(
      textarea?.value
    ).toBe("")
    expect(activeElementName(window)).toBe("text")
  })

  it("does not submit a disabled conversation form", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<section data-panel="workbench">`,
        `<form data-action="submit-conversation">`,
        `<textarea name="text" disabled>blocked text</textarea>`,
        `<p-status role="status" aria-live="polite">Host setup required</p>`,
        `<button type="submit" disabled>Start</button>`,
        `</form>`,
        `</section>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: `<section data-wanex-product-app-web="surface">unexpected</section>`
        },
        submitResult: {
          ok: true
        }
      })
    })

    installBrowserClient(window)
    const form = submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    expect(fetchCalls).toHaveLength(0)
    expect((form.querySelector("button") as HTMLButtonElement).disabled).toBe(true)
  })

  it("projects conversation form errors after a replaced surface", async () => {
    const window = createWindow()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="submit-conversation">`,
        `<textarea name="text">bad text</textarea>`,
        `<p-status role="status" aria-live="polite">Ready to send</p>`,
        `<button type="submit">Send</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async () =>
      jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "submitActionInput",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<form data-action="submit-conversation">`,
            `<textarea name="text">bad text</textarea>`,
            `<p-status role="status" aria-live="polite">Ready to send</p>`,
            `<button type="submit">Send</button>`,
            `</form>`,
            `</section>`
          ].join("")
        },
        submitResult: {
          ok: false,
          parse: {
            ok: false,
            error: {
              code: "invalid_field",
              field: "text",
              message: "text must not be empty"
            }
          }
        }
      })
    )

    installBrowserClient(window)
    submitFirstForm(window)
    await window.happyDOM.whenAsyncComplete()

    expect(
      window.document.querySelector("[data-wanex-product-app-web-alert]")?.textContent
    ).toBe("text must not be empty")
  })

  it("polls events through bounded request envelopes without overlap", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    const firstPoll = deferred<void>()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      pollIntervalMs: 10,
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<h1>Wanex Product App</h1>`,
        `<p>initial</p>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      await firstPoll.promise
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "pollEvents",
        requestId: "dom_poll",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<h1>Wanex Product App</h1>`,
            `<p>polled</p>`,
            `</section>`
          ].join("")
        }
      })
    })

    try {
      installBrowserClient(window)
      await delay(35)

      expect(fetchCalls).toHaveLength(1)
      expect(
        window.document
          .querySelector(SURFACE_SELECTOR)
          ?.getAttribute("data-wanex-product-app-web-polling")
      ).toBe("true")
      expect(fetchCalls[0]?.url).toBe("/wanex/product-app-web/request")
      const body = JSON.parse(String(fetchCalls[0]?.init.body))
      expect(body).toMatchObject({
        kind: "product-app-web.request",
        operation: "pollEvents",
        input: {
          limit: 20
        }
      })
      expect(surfaceText(window)).toContain("initial")

      firstPoll.resolve()
      await delay(0)

      expect(surfaceText(window)).toContain("polled")
      expect(
        window.document
          .querySelector(SURFACE_SELECTOR)
          ?.hasAttribute("data-wanex-product-app-web-polling")
      ).toBe(false)
    } finally {
      window.close()
    }
  })

  it("defers polling while an editable surface field has focus", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    const firstPoll = deferred<void>()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      pollIntervalMs: 10,
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="submit-conversation">`,
        `<textarea name="text">draft message</textarea>`,
        `<button type="submit">Send</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      await firstPoll.promise
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "pollEvents",
        requestId: "dom_poll_after_blur",
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<p>polled after blur</p>`,
            `</section>`
          ].join("")
        }
      })
    })

    try {
      const textarea = window.document.querySelector("textarea")
      textarea?.focus()
      expect(window.document.activeElement).toBe(textarea)

      installBrowserClient(window)
      await delay(35)
      expect(fetchCalls).toHaveLength(0)
      expect(surfaceText(window)).toContain("draft message")

      textarea?.blur()
      await delay(20)
      expect(fetchCalls).toHaveLength(1)

      firstPoll.resolve()
      await delay(0)
      expect(surfaceText(window)).toContain("polled after blur")
    } finally {
      window.close()
    }
  })

  it("keeps an in-flight poll from replacing newly edited form state", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    const firstPoll = deferred<void>()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      pollIntervalMs: 10,
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="submit-conversation">`,
        `<textarea name="text"></textarea>`,
        `<button type="submit">Send</button>`,
        `</form>`,
        `<p>initial surface</p>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      if (fetchCalls.length === 1) {
        await firstPoll.promise
      }
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "pollEvents",
        requestId: `dom_poll_${fetchCalls.length}`,
        document: {
          kind: "product-app-web.document",
          html: [
            `<section data-wanex-product-app-web="surface">`,
            `<form data-action="submit-conversation">`,
            `<textarea name="text"></textarea>`,
            `<button type="submit">Send</button>`,
            `</form>`,
            `<p>polled surface</p>`,
            `</section>`
          ].join("")
        }
      })
    })

    try {
      installBrowserClient(window)
      await delay(20)
      expect(fetchCalls).toHaveLength(1)

      const textarea = window.document.querySelector("textarea")
      expect(textarea).not.toBeNull()
      textarea?.focus()
      if (textarea !== null) {
        textarea.value = "draft created while poll is in flight"
      }
      firstPoll.resolve()
      await delay(0)

      expect(surfaceText(window)).toContain("initial surface")
      expect(window.document.querySelector("textarea")).toBe(textarea)
      expect(textarea?.value).toBe("draft created while poll is in flight")
      expect(window.document.activeElement).toBe(textarea)

      textarea?.blur()
      await delay(25)
      expect(fetchCalls).toHaveLength(1)
      expect(textarea?.value).toBe("draft created while poll is in flight")

      if (textarea !== null) {
        textarea.value = ""
      }
      await delay(25)
      expect(fetchCalls.length).toBeGreaterThan(1)
      expect(surfaceText(window)).toContain("polled surface")
    } finally {
      window.close()
    }
  })

  it("defers polling for an unfocused changed select value", async () => {
    const window = createWindow()
    const fetchCalls: FetchCall[] = []
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      pollIntervalMs: 10,
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="set-layout">`,
        `<select name="layout">`,
        `<option value="single">Single</option>`,
        `<option value="split">Split</option>`,
        `</select>`,
        `<button type="submit">Apply</button>`,
        `</form>`,
        `</section>`
      ].join("")
    })
    setFetch(window, async (url, init) => {
      fetchCalls.push({ url, init })
      return jsonResponse({
        kind: "product-app-web.response",
        ok: true,
        operation: "pollEvents",
        document: {
          kind: "product-app-web.document",
          html: `<section data-wanex-product-app-web="surface"><p>polled</p></section>`
        }
      })
    })

    try {
      const select = window.document.querySelector("select") as HTMLSelectElement
      select.value = "split"
      installBrowserClient(window)
      await delay(25)

      expect(fetchCalls).toHaveLength(0)
      expect(select.value).toBe("split")

      select.value = "single"
      await delay(25)
      expect(fetchCalls.length).toBeGreaterThan(0)
      expect(surfaceText(window)).toContain("polled")
    } finally {
      window.close()
    }
  })

  it("activates generated command fields and manages bounded dense array rows", () => {
    const window = createWindow()
    installDocument(window, {
      requestPath: "/wanex/product-app-web/request",
      surfaceHtml: [
        `<section data-wanex-product-app-web="surface">`,
        `<form data-action="preview-command" data-command-invocation-form>`,
        `<select name="commandId">`,
        `<option value="generated" selected>Generated</option>`,
        `<option value="raw">Raw</option>`,
        `</select>`,
        `<fieldset data-command-input-command="generated">`,
        `<div data-command-input-node="object" data-command-input-path="/optional">`,
        `<input type="checkbox" name="commandPresence:/optional" value="true" data-command-container-toggle>`,
        `<fieldset data-command-container-content disabled>`,
        `<input name="commandInput:/optional/text">`,
        `</fieldset>`,
        `</div>`,
        `<div data-command-input-node="array" data-command-input-array data-command-input-path="/tags" data-min-items="0" data-max-items="2">`,
        `<fieldset data-command-container-content>`,
        `<div data-command-array-rows></div>`,
        `<template data-command-array-template>`,
        `<div data-command-array-row data-array-index="0" data-command-array-template-row>`,
        `<input type="hidden" name="commandArrayItem:/tags/0" value="true" disabled>`,
        `<input name="commandInput:/tags/0" disabled>`,
        `<template data-nested-template>`,
        `<template data-deep-template>`,
        `<input name="commandInput:/tags/0/nested/0" disabled>`,
        `</template>`,
        `</template>`,
        `<button type="button" data-command-array-remove>Remove</button>`,
        `</div>`,
        `</template>`,
        `<button type="button" data-command-array-add>Add</button>`,
        `</fieldset>`,
        `</div>`,
        `</fieldset>`,
        `<fieldset data-command-input-command="raw" hidden disabled>`,
        `<textarea name="inputJson"></textarea>`,
        `</fieldset>`,
        `</form>`,
        `</section>`
      ].join("")
    })

    installBrowserClient(window)
    const selector = window.document.querySelector(
      '[data-command-invocation-form] [name="commandId"]'
    ) as HTMLSelectElement
    selector.value = "raw"
    selector.dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(
      window.document.querySelector('[data-command-input-command="generated"]')
        ?.hasAttribute("disabled")
    ).toBe(true)
    expect(
      window.document.querySelector('[data-command-input-command="raw"]')
        ?.hasAttribute("disabled")
    ).toBe(false)

    selector.value = "generated"
    selector.dispatchEvent(new window.Event("change", { bubbles: true }))
    const toggle = window.document.querySelector(
      "[data-command-container-toggle]"
    ) as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(
      window.document.querySelector(
        '[data-command-input-path="/optional"] [data-command-container-content]'
      )?.hasAttribute("disabled")
    ).toBe(false)

    const add = window.document.querySelector(
      "[data-command-array-add]"
    ) as HTMLButtonElement
    add.click()
    add.click()
    add.click()
    const rows = window.document.querySelectorAll(
      "[data-command-array-rows] > [data-command-array-row]"
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]?.querySelector("input[name='commandInput:/tags/1']")).not.toBeNull()
    const deepTemplate = rows[1]?.querySelector(
      "template[data-deep-template]"
    ) as HTMLTemplateElement | null
    expect(
      deepTemplate?.content.querySelector(
        "input[name='commandInput:/tags/1/nested/0']"
      )
    ).not.toBeNull()

    ;(rows[0]?.querySelector("[data-command-array-remove]") as HTMLButtonElement).click()
    const remaining = window.document.querySelector(
      "[data-command-array-rows] > [data-command-array-row]"
    )
    expect(remaining?.getAttribute("data-array-index")).toBe("0")
    expect(remaining?.querySelector("input[name='commandInput:/tags/0']")).not.toBeNull()
  })
})

function createWindow(): Window {
  return new Window({
    url: "http://127.0.0.1/"
  })
}

function installDocument(
  window: Window,
  options: {
    readonly requestPath: string
    readonly pollIntervalMs?: number
    readonly surfaceHtml: string
  }
): void {
  const pollInterval =
    options.pollIntervalMs === undefined
      ? ""
      : ` data-poll-interval-ms="${options.pollIntervalMs}"`
  window.document.body.innerHTML = [
    `<main data-wanex-product-app-web-shell>`,
    options.surfaceHtml,
    `</main>`,
    `<script data-wanex-product-app-web-client data-request-path="${options.requestPath}"${pollInterval}></script>`
  ].join("")
}

function installBrowserClient(window: Window): void {
  window.eval(PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT)
}

function setFetch(
  window: Window,
  fetch: (url: string, init: FetchCall["init"]) => Promise<unknown>
): void {
  ;(window as unknown as { fetch: unknown }).fetch = async (
    url: string,
    init: FetchCall["init"]
  ) => await fetch(url, init)
}

interface SubmittedFormHandle {
  readonly getAttribute: (name: string) => string | null
  readonly querySelector: (selector: string) => { readonly textContent: string | null } | null
}

function submitFirstForm(window: Window): SubmittedFormHandle {
  const form = window.document.querySelector("form")
  expect(form).not.toBeNull()
  form?.dispatchEvent(
    new window.Event("submit", {
      bubbles: true,
      cancelable: true
    })
  )
  return form as unknown as SubmittedFormHandle
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {
    promise,
    resolve,
    reject
  }
}

function jsonResponse(body: unknown): unknown {
  return {
    ok: true,
    status: 200,
    async json() {
      return body
    }
  }
}

function surfaceText(window: Window): string {
  return window.document.querySelector(SURFACE_SELECTOR)?.textContent ?? ""
}

function activeElementName(window: Window): string | null {
  return window.document.activeElement?.getAttribute("name") ?? null
}
