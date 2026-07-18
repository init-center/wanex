export function backoffMs(
  failures: number,
  initialBackoffMs: number,
  maxBackoffMs: number
): number {
  if (failures <= 0) {
    return 0
  }
  const multiplier = 2 ** Math.max(0, failures - 1)
  return Math.min(maxBackoffMs, initialBackoffMs * multiplier)
}
