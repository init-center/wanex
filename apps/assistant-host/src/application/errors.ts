export function preservePrimaryError(
  primary: unknown,
  cleanup: unknown,
): Error {
  if (primary instanceof Error && primary.cause === undefined) {
    Object.defineProperty(primary, "cause", {
      configurable: true,
      enumerable: false,
      value: cleanup,
      writable: true,
    })
    return primary
  }
  return new AggregateError(
    [primary, cleanup],
    primary instanceof Error
      ? primary.message
      : "Assistant startup failed",
    { cause: primary },
  )
}
