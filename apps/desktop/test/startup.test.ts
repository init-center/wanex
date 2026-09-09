// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { waitForDesktopInteractive } from "../src/proof/startup.js"

const onboarding = `<main data-ui-assistant-shell><section data-ui-settings-panel>
  <form data-ui-provider-form><input name="conversationModelId"><input name="credential">
  <button type="submit">Connect</button></form></section></main>`
const conversation = `<main data-ui-assistant-shell><form data-ui-composer>
  <textarea name="text"></textarea><button type="submit" disabled>Send</button></form>
  <div data-ui-model-selector><select name="endpointId"><option>Model</option></select></div></main>`

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
    ({ width: 100, height: 30 }) as DOMRect)
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("Desktop first interactive boundary", () => {
  it.each([onboarding, conversation])("waits for a usable surface and paint without submitting a form", async (html) => {
    document.body.innerHTML = html
    const submit = vi.fn()
    document.querySelector("form")!.addEventListener("submit", submit)
    const settled = vi.fn()
    const result = waitForDesktopInteractive().then(settled)
    expect(settled).not.toHaveBeenCalled()
    await result
    expect(settled).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
  })

  it("observes loading completion instead of treating a form skeleton as ready", async () => {
    document.body.innerHTML = onboarding
    const loading = document.createElement("p")
    loading.setAttribute("data-ui-provider-loading", "")
    document.querySelector("section")!.append(loading)
    const settled = vi.fn()
    const result = waitForDesktopInteractive().then(settled)
    expect(settled).not.toHaveBeenCalled()
    loading.remove()
    await result
    expect(settled).toHaveBeenCalledOnce()
  })

  it.each(["disabled", "hidden", "inert", "error", "missing"])('rejects a %s surface with a bounded failure', async (state) => {
    document.body.innerHTML = onboarding
    const input = document.querySelector("input")!
    if (state === "disabled") input.disabled = true
    if (state === "hidden") input.hidden = true
    if (state === "inert") input.parentElement!.setAttribute("inert", "")
    if (state === "error") document.querySelector("section")!.insertAdjacentHTML("beforeend", '<p role="alert">Failed</p>')
    if (state === "missing") input.remove()
    const result = expect(waitForDesktopInteractive(50)).rejects.toThrow("interactive onboarding form or composer")
    await result
  })

  it("rechecks readiness after the paint boundary", async () => {
    document.body.innerHTML = conversation
    const settled = vi.fn()
    const result = waitForDesktopInteractive().then(settled)
    const textarea = document.querySelector("textarea")!
    textarea.disabled = true
    expect(settled).not.toHaveBeenCalled()
    textarea.disabled = false
    await result
    expect(settled).toHaveBeenCalledOnce()
  })
})
