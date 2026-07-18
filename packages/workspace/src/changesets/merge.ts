export function mergeText(
  baseText: string,
  currentText: string,
  targetText: string
): string | null {
  const base = splitLines(baseText)
  const current = splitLines(currentText)
  const target = splitLines(targetText)
  const currentChanged = changedLineIndexes(base, current)
  const targetChanged = changedLineIndexes(base, target)
  if (intersects(currentChanged, targetChanged)) {
    return null
  }
  const merged = [...base]
  for (const index of currentChanged) {
    merged[index] = current[index] ?? ""
  }
  for (const index of targetChanged) {
    merged[index] = target[index] ?? ""
  }
  return merged.join("")
}

function splitLines(text: string): string[] {
  const matches = text.match(/[^\n]*\n|[^\n]+/g)
  return matches ?? []
}

function changedLineIndexes(base: readonly string[], next: readonly string[]): Set<number> {
  const changed = new Set<number>()
  const max = Math.max(base.length, next.length)
  for (let index = 0; index < max; index += 1) {
    if ((base[index] ?? "") !== (next[index] ?? "")) {
      changed.add(index)
    }
  }
  return changed
}

function intersects(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  for (const item of left) {
    if (right.has(item)) {
      return true
    }
  }
  return false
}
