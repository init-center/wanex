export function expectSurfaceValue<T>(
  result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: { readonly message: string } },
  command: string
): T {
  if (!result.ok) {
    throw new Error(`${command} failed: ${result.error.message}`)
  }
  return result.value
}

export function expectSurfaceOk(
  result: {
    readonly ok: boolean
    readonly error?: { readonly message: string }
  },
  command: string
): void {
  if (!result.ok) {
    throw new Error(
      `${command} failed: ${result.error?.message ?? "unknown error"}`
    )
  }
}
