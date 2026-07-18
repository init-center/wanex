export function uniqueSortedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort()
}
