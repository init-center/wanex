import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open, opendir } from "node:fs/promises"
import { join, relative } from "node:path"
import {
  validatePackageRelativePath
} from "../internal-validation.js"
import type {
  PluginPackageFileEntry,
  PluginPackageLayout
} from "../types-package.js"
import { LOCAL_PLUGIN_MANIFEST_FILE } from "./manifest.js"
import type {
  LocalPluginPackageDependencyEvidence,
  LocalPluginPackageFileEvidence,
  LocalPluginPackageLimits
} from "./types.js"

export interface LocalPluginPackageClosure {
  readonly files: readonly LocalPluginPackageFileEvidence[]
  readonly dependencies: readonly LocalPluginPackageDependencyEvidence[]
  readonly totalFileBytes: number
}

export async function inspectLocalPluginPackageClosure(
  sourceDir: string,
  layout: PluginPackageLayout,
  limits: LocalPluginPackageLimits
): Promise<LocalPluginPackageClosure> {
  const declaredFiles = requireDeclaredFiles(layout)
  const discovered = await walkPackageFiles(sourceDir, limits)
  const expectedPaths = [LOCAL_PLUGIN_MANIFEST_FILE, ...declaredFiles.keys()].sort()
  if (JSON.stringify(discovered) !== JSON.stringify(expectedPaths)) {
    const expected = new Set(expectedPaths)
    const actual = new Set(discovered)
    const missing = expectedPaths.filter((path) => !actual.has(path))
    const extra = discovered.filter((path) => !expected.has(path))
    throw new Error(
      `local plugin package file closure mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`
    )
  }

  const files: LocalPluginPackageFileEvidence[] = []
  let totalFileBytes = 0
  for (const [path, declaration] of [...declaredFiles].sort(compareEntry)) {
    const evidence = await inspectDeclaredFile(sourceDir, path, declaration, limits)
    totalFileBytes += evidence.bytes
    if (totalFileBytes > limits.maxTotalBytes) {
      throw new Error(
        `local plugin package exceeds ${limits.maxTotalBytes} total bytes`
      )
    }
    files.push(evidence)
  }
  assertEntryExecutable(layout, declaredFiles)
  return {
    files,
    dependencies: inspectDependencies(layout, files),
    totalFileBytes
  }
}

function requireDeclaredFiles(
  layout: PluginPackageLayout
): Map<string, PluginPackageFileEntry> {
  if (layout.files === undefined || layout.files.length === 0) {
    throw new Error("local plugin package files must be a non-empty complete closure")
  }
  const files = new Map<string, PluginPackageFileEntry>()
  for (const file of layout.files) {
    validatePackageRelativePath(file.path, "local plugin package file path")
    if (file.path === LOCAL_PLUGIN_MANIFEST_FILE) {
      throw new Error("local plugin manifest must not appear in layout files")
    }
    if (file.sha256 === undefined || file.bytes === undefined) {
      throw new Error(
        `local plugin package file must declare sha256 and bytes: ${file.path}`
      )
    }
    if (files.has(file.path)) {
      throw new Error(`duplicate local plugin package file: ${file.path}`)
    }
    files.set(file.path, file)
  }
  return files
}

async function walkPackageFiles(
  sourceDir: string,
  limits: LocalPluginPackageLimits
): Promise<string[]> {
  const files: string[] = []
  const visit = async (dir: string): Promise<void> => {
    const handle = await opendir(dir)
    for await (const entry of handle) {
      const absolute = join(dir, entry.name)
      const path = relative(sourceDir, absolute).replaceAll("\\", "/")
      validateBoundedPath(path, limits)
      if (entry.isSymbolicLink()) {
        throw new Error(`local plugin package rejects symbolic link: ${path}`)
      }
      if (entry.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`local plugin package rejects non-regular entry: ${path}`)
      }
      files.push(path)
      if (files.length > limits.maxFiles + 1) {
        throw new Error(`local plugin package exceeds ${limits.maxFiles} files`)
      }
    }
  }
  await visit(sourceDir)
  return files.sort()
}

async function inspectDeclaredFile(
  sourceDir: string,
  path: string,
  declaration: PluginPackageFileEntry,
  limits: LocalPluginPackageLimits
): Promise<LocalPluginPackageFileEvidence> {
  validateBoundedPath(path, limits)
  const noFollow = typeof constants.O_NOFOLLOW === "number"
    ? constants.O_NOFOLLOW
    : 0
  let handle
  try {
    handle = await open(join(sourceDir, path), constants.O_RDONLY | noFollow)
  } catch (error) {
    if (isCode(error, "ELOOP")) {
      throw new Error(`local plugin package rejects symbolic link: ${path}`)
    }
    throw error
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) {
      throw new Error(`local plugin package file is not regular: ${path}`)
    }
    if (stat.size > limits.maxFileBytes) {
      throw new Error(
        `local plugin package file exceeds ${limits.maxFileBytes} bytes: ${path}`
      )
    }
    if (stat.size !== declaration.bytes) {
      throw new Error(`local plugin package file byte count mismatch: ${path}`)
    }
    const bytes = await handle.readFile()
    if (bytes.byteLength !== stat.size) {
      throw new Error(`local plugin package file changed while being read: ${path}`)
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    if (sha256 !== declaration.sha256) {
      throw new Error(`local plugin package file sha256 mismatch: ${path}`)
    }
    const declaredExecutable = declaration.executable === true
    if (process.platform !== "win32") {
      const observedExecutable = (stat.mode & 0o111) !== 0
      if (observedExecutable !== declaredExecutable) {
        throw new Error(`local plugin package file executable mismatch: ${path}`)
      }
    }
    return {
      path,
      bytes: stat.size,
      sha256,
      executable: declaredExecutable
    }
  } finally {
    await handle.close()
  }
}

function assertEntryExecutable(
  layout: PluginPackageLayout,
  files: ReadonlyMap<string, PluginPackageFileEntry>
): void {
  const entry = files.get(layout.entry.command)
  if (entry === undefined) {
    throw new Error("local plugin package entry command is not a declared file")
  }
  if (entry.executable !== true) {
    throw new Error("local plugin package entry command must be executable")
  }
}

function inspectDependencies(
  layout: PluginPackageLayout,
  files: readonly LocalPluginPackageFileEvidence[]
): readonly LocalPluginPackageDependencyEvidence[] {
  const dependencies = new Map(
    (layout.runtimeDependencies ?? []).map((dependency) => [dependency.name, dependency])
  )
  const bundledBytes = new Map<string, number>()
  for (const file of files) {
    const packageName = nodeModulesPackageName(file.path)
    if (packageName === undefined) {
      continue
    }
    const dependency = dependencies.get(packageName)
    if (dependency?.distribution !== "bundled") {
      throw new Error(
        `local plugin package contains undeclared bundled dependency: ${packageName}`
      )
    }
    bundledBytes.set(packageName, (bundledBytes.get(packageName) ?? 0) + file.bytes)
  }
  return [...dependencies.values()]
    .sort((left, right) => compareText(left.name, right.name))
    .map((dependency) => {
      const observedBytes = bundledBytes.get(dependency.name) ?? 0
      if (dependency.distribution === "bundled") {
        if (observedBytes === 0) {
          throw new Error(
            `local plugin package bundled dependency is missing: ${dependency.name}`
          )
        }
        if (
          dependency.maxPackedBytes === undefined ||
          observedBytes > dependency.maxPackedBytes
        ) {
          throw new Error(
            `local plugin package bundled dependency exceeds maxPackedBytes: ${dependency.name}`
          )
        }
      } else if (observedBytes > 0) {
        throw new Error(
          `local plugin package ${dependency.distribution} dependency must not be bundled: ${dependency.name}`
        )
      }
      return {
        name: dependency.name,
        distribution: dependency.distribution,
        loading: dependency.loading,
        observedBytes,
        ...(dependency.maxPackedBytes === undefined
          ? {}
          : { maxPackedBytes: dependency.maxPackedBytes }),
        present: observedBytes > 0
      }
    })
}

function nodeModulesPackageName(path: string): string | undefined {
  const segments = path.split("/")
  if (segments[0] !== "node_modules" || segments.length < 2) {
    return undefined
  }
  if (segments[1]?.startsWith("@")) {
    return segments.length < 3 ? segments[1] : `${segments[1]}/${segments[2]}`
  }
  return segments[1]
}

function validateBoundedPath(
  path: string,
  limits: LocalPluginPackageLimits
): void {
  validatePackageRelativePath(path, "local plugin package path")
  if (Buffer.byteLength(path, "utf8") > limits.maxPathBytes) {
    throw new Error(`local plugin package path exceeds ${limits.maxPathBytes} bytes`)
  }
  if (path.split("/").length > limits.maxPathDepth) {
    throw new Error(`local plugin package path exceeds depth ${limits.maxPathDepth}`)
  }
}

function compareEntry(
  left: readonly [string, PluginPackageFileEntry],
  right: readonly [string, PluginPackageFileEntry]
): number {
  return compareText(left[0], right[0])
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
