export interface WanexDesktopOwnedLifecycle {
  readonly state: "open" | "closing" | "closed"
  close(): Promise<void>
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
