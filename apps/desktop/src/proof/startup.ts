// Self-contained so the same observation can run in the installed Renderer.
export async function waitForDesktopInteractive(timeoutMs = 10_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let painting = false
    let firstFrame = 0
    let secondFrame = 0
    const observer = new MutationObserver(check)
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("Desktop did not expose an interactive onboarding form or composer"))
    }, timeoutMs)

    function cleanup(): void {
      clearTimeout(timeout)
      observer.disconnect()
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }

    function usable(element: Element | null): boolean {
      if (!(element instanceof HTMLElement) || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return !element.matches(":disabled") && style.visibility !== "hidden" &&
        style.display !== "none" && bounds.width > 0 && bounds.height > 0
    }

    function ready(): boolean {
      const shell = document.querySelector("[data-ui-assistant-shell]")
      if (shell === null || shell.querySelector('[role="alert"]')) return false
      const settings = shell.querySelector("[data-ui-settings-panel]")
      if (settings !== null) {
        const form = settings.querySelector("[data-ui-provider-form]")
        return settings.querySelector("[data-ui-provider-loading]") === null &&
          usable(form?.querySelector('input[name="conversationModelId"]') ?? null) &&
          usable(form?.querySelector('input[name="credential"]') ?? null) &&
          usable(form?.querySelector('button[type="submit"]') ?? null)
      }
      return usable(shell.querySelector('[data-ui-composer] textarea[name="text"]')) &&
        usable(shell.querySelector('[data-ui-model-selector] select[name="endpointId"]'))
    }

    function check(): void {
      if (painting || !ready()) return
      painting = true
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          painting = false
          if (!ready()) return
          cleanup()
          resolve()
        })
      })
    }

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true
    })
    check()
  })
}
