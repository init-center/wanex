import { isAbsolute, join, relative, resolve, sep } from "node:path"

export function normalizeAbsolutePath(path: string): string {
  return resolve(path)
}

export function isInsideOrSame(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export function upwardDirectories(options: {
  readonly start: string
  readonly stop: string
}): readonly string[] {
  const start = resolve(options.start)
  const stop = resolve(options.stop)
  if (!isInsideOrSame(stop, start)) {
    return []
  }

  const directories: string[] = []
  let current = start
  while (true) {
    directories.push(current)
    if (current === stop) {
      break
    }
    const next = resolve(join(current, ".."))
    if (next === current) {
      break
    }
    current = next
  }
  return directories.reverse()
}

export function isSafeRelativeDirectory(path: string): boolean {
  return (
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes("\0") &&
    !path.split(/[\\/]/u).some((part) => part === "" || part === "." || part === "..")
  )
}
