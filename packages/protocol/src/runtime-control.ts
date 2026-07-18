export type RuntimeAbortListener = () => void

export interface RuntimeAbortSignal {
  readonly aborted: boolean
  addEventListener(
    type: "abort",
    listener: RuntimeAbortListener,
    options?: boolean | { readonly capture?: boolean; readonly once?: boolean }
  ): void
  removeEventListener(
    type: "abort",
    listener: RuntimeAbortListener,
    options?: boolean | { readonly capture?: boolean }
  ): void
}
