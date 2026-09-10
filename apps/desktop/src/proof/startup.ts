import type { Client } from "@wanex/assistant-ui/client";

export interface DesktopRendererStartupTimings {
  readonly navigationToBootstrap: number;
  readonly bootstrapToRootCommit: number;
  readonly rootCommitToSnapshotRequest: number;
  readonly initialSnapshot: number;
  readonly snapshotResponseToAssistantSurface: number;
  readonly assistantSurfaceToInteractivePaint: number;
  readonly total: number;
}

export function markDesktopRendererBootstrap(): void {
  markOnce("wanex.desktop.renderer.bootstrap");
}

export function markDesktopRendererRootCommit(): void {
  markOnce("wanex.desktop.renderer.root-commit");
}

export function observeDesktopInitialSnapshot(client: Client): Client {
  const readInitialSnapshot = client.readInitialSnapshot;
  if (readInitialSnapshot === undefined) return client;
  return {
    ...client,
    async readInitialSnapshot() {
      markOnce("wanex.desktop.renderer.snapshot-request");
      try {
        return await readInitialSnapshot.call(client);
      } finally {
        markOnce("wanex.desktop.renderer.snapshot-response");
      }
    },
  };
}

function markOnce(name: string): void {
  if (performance.getEntriesByName(name, "mark").length === 0) {
    performance.mark(name);
  }
}

// Self-contained so the same observation can run in the installed Renderer.
export async function waitForDesktopInteractive(
  timeoutMs = 10_000,
): Promise<DesktopRendererStartupTimings> {
  return await new Promise<DesktopRendererStartupTimings>((resolve, reject) => {
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
      if (performance.getEntriesByName(
        "wanex.desktop.renderer.assistant-surface",
        "mark",
      ).length === 0) {
        performance.mark("wanex.desktop.renderer.assistant-surface")
      }
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
          performance.mark("wanex.desktop.renderer.interactive")
          try {
            const timings = readTimings()
            cleanup()
            resolve(timings)
          } catch (error) {
            cleanup()
            reject(error)
          }
        })
      })
    }

    function readTimings(): DesktopRendererStartupTimings {
      const names = [
        "wanex.desktop.renderer.bootstrap",
        "wanex.desktop.renderer.root-commit",
        "wanex.desktop.renderer.snapshot-request",
        "wanex.desktop.renderer.snapshot-response",
        "wanex.desktop.renderer.assistant-surface",
        "wanex.desktop.renderer.interactive",
      ] as const
      const marks = names.map((name) => {
        const value = performance.getEntriesByName(name, "mark").at(-1)?.startTime
        if (value === undefined || !Number.isFinite(value) || value < 0) {
          throw new Error(`Desktop Renderer startup mark is missing: ${name}`)
        }
        return value
      })
      for (let index = 1; index < marks.length; index += 1) {
        if ((marks[index] ?? 0) < (marks[index - 1] ?? 0)) {
          throw new Error("Desktop Renderer startup marks are out of order")
        }
      }
      const [bootstrap, rootCommit, snapshotRequest, snapshotResponse,
        assistantSurface, interactive] = marks as [number, number, number, number, number, number]
      return {
        navigationToBootstrap: round(bootstrap),
        bootstrapToRootCommit: round(rootCommit - bootstrap),
        rootCommitToSnapshotRequest: round(snapshotRequest - rootCommit),
        initialSnapshot: round(snapshotResponse - snapshotRequest),
        snapshotResponseToAssistantSurface: round(assistantSurface - snapshotResponse),
        assistantSurfaceToInteractivePaint: round(interactive - assistantSurface),
        total: round(interactive),
      }
    }

    function round(value: number): number {
      return Math.round(value * 100) / 100
    }

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true
    })
    check()
  })
}
