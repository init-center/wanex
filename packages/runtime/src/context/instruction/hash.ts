export function stableInstructionHash(value: string): string {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
