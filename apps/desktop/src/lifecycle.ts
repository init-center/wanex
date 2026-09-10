export interface WanexDesktopOwnedLifecycle {
  readonly state: "open" | "closing" | "closed"
  close(): Promise<void>
}

export interface WanexDesktopOwnedResourceClosers {
  readonly coding?: () => Promise<void>
  readonly remoteCoding?: () => Promise<void>
  readonly assistant?: () => Promise<void>
}

export async function closeWanexDesktopOwnedResources(
  closers: WanexDesktopOwnedResourceClosers,
): Promise<void> {
  const results = await Promise.allSettled([
    closers.coding?.(),
    closers.remoteCoding?.(),
    closers.assistant?.(),
  ])
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (failure !== undefined) throw failure.reason
}

export function shouldShutdownAfterWindowAllClosed(
  platform: NodeJS.Platform,
  state: WanexDesktopOwnedLifecycle["state"],
): boolean {
  return platform !== "darwin" && state === "open"
}

export function createWanexDesktopOwnedLifecycle(
  closeOwnedResources: () => Promise<void>
): WanexDesktopOwnedLifecycle {
  let state: WanexDesktopOwnedLifecycle["state"] = "open"
  let closePromise: Promise<void> | undefined
  return {
    get state() {
      return state
    },
    async close() {
      if (closePromise !== undefined) return await closePromise
      state = "closing"
      closePromise = closeOwnedResources().then(
        () => {
          state = "closed"
        },
        (error: unknown) => {
          state = "closed"
          throw error
        }
      )
      return await closePromise
    }
  }
}
