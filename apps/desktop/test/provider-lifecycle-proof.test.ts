// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  wanexDesktopProviderLifecycleProofFactorySource,
  type WanexDesktopProviderLifecycleProofFactory
} from "../src/provider-lifecycle-proof.js"

const source = "Verify the surviving Provider"
const response = "Fallback reply"

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = `<main data-ui-assistant-shell>
    <button data-ui-action="open-settings">Settings</button>
    <div data-ui-provider-state="ready"></div>
    <div data-ui-model-selector><select name="endpointId"><option>primary</option></select></div>
    <section data-ui-conversation-timeline data-ui-conversation-state="running"
      data-ui-session-id="session-1" data-ui-operation-id="operation-1">
      <article data-ui-conversation-row="user-1" data-ui-role="user">First</article>
      <article data-ui-conversation-row="assistant-1" data-ui-role="assistant">First reply</article>
    </section>
    <form data-ui-composer data-ui-composer-mode="submit">
      <textarea name="text" disabled>Previous draft</textarea><button type="submit">Send</button>
    </form>
  </main>`
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector(selector)
  if (!(value instanceof HTMLElement)) throw new Error(`Missing fixture element: ${selector}`)
  return value as T
}

function start() {
  // Execute the same serialized factory that Electron injects into the renderer.
  const factory = new Function(`return (${wanexDesktopProviderLifecycleProofFactorySource()})`)() as
    WanexDesktopProviderLifecycleProofFactory
  const proof = factory({
    primaryBaseUrl: "http://localhost/primary",
    selectedBaseUrl: "http://localhost/selected",
    credential: "fixture-credential",
    primaryModelId: "primary",
    selectedDraftModelId: "draft",
    selectedModelId: "selected",
    fallbackResponse: response
  })
  const opened = vi.fn(() => {
    element("main").insertAdjacentHTML("beforeend", `<section data-ui-settings-panel>
      <button aria-label="Close settings">Close</button>
      <div data-ui-provider="primary"></div>
      <div data-ui-provider="selected" data-ui-conversation-model-id="selected">
        <button data-ui-provider-remove="selected">Remove</button>
      </div>
    </section>`)
    element('[data-ui-provider-remove]').addEventListener("click", () => {
      if (window.confirm("Remove?")) element('[data-ui-provider="selected"]').remove()
    })
    element('[aria-label="Close settings"]').addEventListener("click", () => {
      element('[data-ui-settings-panel]').remove()
    })
  })
  element('[data-ui-action="open-settings"]').addEventListener("click", opened)
  let committed = "Previous draft"
  // Deliberately commit after the proof's next observation and replace all controls.
  element("main").addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return
    const draft = event.target.value
    setTimeout(() => {
      committed = draft
      const form = element<HTMLFormElement>("form")
      const replacement = form.cloneNode(true) as HTMLFormElement
      const textarea = replacement.querySelector("textarea")!
      textarea.value = draft
      replacement.querySelector("button")!.disabled = draft.length === 0
      form.replaceWith(replacement)
    }, 75)
  })
  const submitted = vi.fn((event: Event) => {
    event.preventDefault()
    expect(document.querySelector('[data-ui-settings-panel]')).toBeNull()
    expect(committed).toBe(source)
    element('[data-ui-conversation-timeline]').setAttribute("data-ui-conversation-state", "running")
    element<HTMLTextAreaElement>("textarea").disabled = true
  })
  element("main").addEventListener("submit", submitted)
  const completed = vi.fn()
  const progress = vi.fn()
  const result = proof.removeSelectedAndRunFallback(progress).then((value) => {
    completed(value)
    return value
  })
  return { opened, submitted, completed, result, progress }
}

async function admit() {
  const state = start()
  await vi.advanceTimersByTimeAsync(200)
  expect(state.opened).not.toHaveBeenCalled()
  element('[data-ui-conversation-timeline]').setAttribute("data-ui-conversation-state", "succeeded")
  element<HTMLTextAreaElement>("textarea").disabled = false
  await vi.advanceTimersByTimeAsync(50)
  expect(state.submitted).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(250)
  expect(state.submitted).toHaveBeenCalledOnce()
  return state
}

function appendReply() {
  element('[data-ui-conversation-timeline]').insertAdjacentHTML("beforeend", `
    <article data-ui-conversation-row="user-2" data-ui-role="user">${source}</article>
    <article data-ui-conversation-row="assistant-2" data-ui-role="assistant">${response}</article>
  `)
}

describe("Provider lifecycle proof behavior", () => {
  it("waits for committed controls and canonical completion, not just visible replies", async () => {
    const state = await admit()
    appendReply()
    await vi.advanceTimersByTimeAsync(100)
    expect(state.completed).not.toHaveBeenCalled()
    const timeline = element('[data-ui-conversation-timeline]')
    timeline.setAttribute("data-ui-operation-id", "operation-2")
    timeline.setAttribute("data-ui-conversation-state", "succeeded")
    element<HTMLTextAreaElement>("textarea").disabled = false
    await vi.advanceTimersByTimeAsync(50)
    await expect(state.result).resolves.toMatchObject({ fallbackModelResponseVisible: true })
    expect(state.submitted).toHaveBeenCalledOnce()
    expect(state.progress).toHaveBeenLastCalledWith({ fallbackModelResponseVisible: true })
  })

  it.each(["session", "operation", "transient", "duplicate-row", "wrong-text"])(
    "does not accept a reply with invalid %s evidence",
    async (invalid) => {
      const state = await admit()
      const rejection = expect(state.result).rejects.toThrow("Desktop proof condition timed out")
      appendReply()
      const timeline = element('[data-ui-conversation-timeline]')
      timeline.setAttribute("data-ui-conversation-state", "succeeded")
      timeline.setAttribute("data-ui-operation-id", invalid === "operation" ? "operation-1" : "operation-2")
      if (invalid === "session") timeline.setAttribute("data-ui-session-id", "session-other")
      if (invalid === "transient") timeline.insertAdjacentHTML("beforeend", '<article data-ui-transient-assistant>Working</article>')
      if (invalid === "duplicate-row") timeline.insertAdjacentHTML("beforeend", '<article data-ui-conversation-row="assistant-3" data-ui-role="assistant">Extra</article>')
      if (invalid === "wrong-text") element('[data-ui-conversation-row="user-2"]').textContent = "Wrong draft"
      element<HTMLTextAreaElement>("textarea").disabled = false
      await vi.advanceTimersByTimeAsync(10_000)
      await rejection
      expect(state.completed).not.toHaveBeenCalled()
      expect(state.submitted).toHaveBeenCalledOnce()
    }
  )
})
