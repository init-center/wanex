import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as nativePath from "node:path"

export async function withExternalFixtureRoot(workspaceRoot, run) {
  const root = await mkdtemp(nativePath.resolve(tmpdir(), "wanex-external-consumers-"))
  assertPathOutsideWorkspace(root, workspaceRoot)
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export function assertPathOutsideWorkspace(path, workspaceRoot) {
  if (isPathInsideOrEqual(path, workspaceRoot)) {
    throw new Error(
      `external consumer root must be outside workspace: ${nativePath.resolve(path)}`
    )
  }
}

export function isPathInsideOrEqual(path, workspaceRoot, pathApi = nativePath) {
  const candidate = pathApi.resolve(path)
  const workspace = pathApi.resolve(workspaceRoot)
  const fromWorkspace = pathApi.relative(workspace, candidate)
  return fromWorkspace === "" || (
    !pathApi.isAbsolute(fromWorkspace) &&
    fromWorkspace !== ".." &&
    !fromWorkspace.startsWith(`..${pathApi.sep}`)
  )
}

export function expectedWanexClosure(topLevelNames, registryPackages) {
  const manifestByName = new Map(registryPackages.map((item) => [
    item.manifest.name,
    item.manifest
  ]))
  const pending = [...topLevelNames]
  const closure = new Map()
  while (pending.length > 0) {
    const name = pending.pop()
    if (closure.has(name)) continue
    const manifest = manifestByName.get(name)
    if (manifest === undefined) {
      throw new Error(`external fixture dependency is absent from SDK registry: ${name}`)
    }
    closure.set(name, manifest.version)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (dependency.startsWith("@wanex/")) pending.push(dependency)
    }
  }
  return Object.fromEntries([...closure].sort(([left], [right]) =>
    left.localeCompare(right)
  ))
}

export function inspectExternalPackageLock(options) {
  const failures = []
  const lock = options.lock
  if (!isRecord(lock) || Number(lock.lockfileVersion) < 3 || !isRecord(lock.packages)) {
    return ["package-lock.json must use lockfileVersion 3 or newer"]
  }

  const serialized = JSON.stringify(lock)
  for (const marker of ["file:", "link:", "workspace:"]) {
    if (serialized.includes(marker)) failures.push(`package lock contains ${marker}`)
  }
  for (const forbiddenPath of options.forbiddenPaths ?? []) {
    const portablePath = forbiddenPath.replaceAll("\\", "/")
    const resolvedPath = nativePath.resolve(forbiddenPath)
    const forbiddenMarkers = new Set([
      forbiddenPath,
      portablePath,
      resolvedPath,
      resolvedPath.replaceAll("\\", "/")
    ])
    if ([...forbiddenMarkers].some((marker) => serialized.includes(marker))) {
      failures.push(`package lock contains forbidden path ${portablePath}`)
    }
  }

  const installed = new Map()
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    const name = wanexNameFromLockPath(packagePath)
    if (name === null) continue
    if (!isRecord(entry) || typeof entry.version !== "string") {
      failures.push(`installed ${name} has no exact version`)
      continue
    }
    const existing = installed.get(name)
    if (existing !== undefined && existing !== entry.version) {
      failures.push(`installed ${name} has multiple versions`)
    }
    installed.set(name, entry.version)
  }

  const expected = new Map(Object.entries(options.expectedWanex))
  const installedNames = [...installed.keys()].sort()
  const expectedNames = [...expected.keys()].sort()
  if (JSON.stringify(installedNames) !== JSON.stringify(expectedNames)) {
    failures.push(
      `installed Wanex closure differs: expected=${expectedNames.join(",")} actual=${installedNames.join(",")}`
    )
  }
  for (const [name, version] of expected) {
    const actual = installed.get(name)
    if (actual !== undefined && actual !== version) {
      failures.push(`installed ${name} version ${actual} differs from ${version}`)
    }
  }

  const rootDependencies = lock.packages[""]?.dependencies
  if (!isRecord(rootDependencies)) {
    failures.push("package lock root dependencies are missing")
  } else {
    const actualTopLevel = Object.keys(rootDependencies)
      .filter((name) => name.startsWith("@wanex/"))
      .sort()
    const expectedTopLevel = [...options.topLevelNames].sort()
    if (JSON.stringify(actualTopLevel) !== JSON.stringify(expectedTopLevel)) {
      failures.push(
        `lock root dependencies differ: expected=${expectedTopLevel.join(",")} actual=${actualTopLevel.join(",")}`
      )
    }
  }
  return failures
}

function wanexNameFromLockPath(packagePath) {
  const normalized = packagePath.replaceAll("\\", "/")
  const match = normalized.match(/(?:^|\/)node_modules\/(@wanex\/[^/]+)$/)
  return match?.[1] ?? null
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
