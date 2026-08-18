import { randomUUID } from "node:crypto"
import {
  chmod,
  copyFile,
  mkdir,
  realpath,
  rename,
  rm,
  stat
} from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { inspectLocalPluginPackage } from "./inspect.js"
import { LOCAL_PLUGIN_MANIFEST_FILE } from "./manifest.js"
import type {
  LocalPluginPackageInspection,
  MaterializeLocalPluginPackageRequest,
  MaterializedLocalPluginPackage
} from "./types.js"

export async function materializeLocalPluginPackage(
  request: MaterializeLocalPluginPackageRequest
): Promise<MaterializedLocalPluginPackage> {
  requireSha256(request.expectedArtifactSha256)
  const source = await inspectLocalPluginPackage(request)
  if (source.artifactSha256 !== request.expectedArtifactSha256) {
    throw new Error("local plugin package inspection is stale")
  }
  if (request.installBaseDir.trim().length === 0) {
    throw new Error("local plugin package installBaseDir must not be empty")
  }
  const base = resolve(request.installBaseDir)
  await mkdir(base, { recursive: true })
  const installBase = await realpath(base)
  if (isWithin(installBase, source.sourceDir)) {
    throw new Error("local plugin package source must be outside installBaseDir")
  }
  const finalRoot = join(
    installBase,
    source.layout.pluginId,
    source.layout.version,
    source.artifactSha256
  )
  const stagingParent = join(installBase, ".staging")
  await mkdir(stagingParent, { recursive: true })
  const stagingRoot = join(stagingParent, randomUUID())
  await mkdir(stagingRoot)

  try {
    await copyPackage(source, stagingRoot)
    const staged = await inspectLocalPluginPackage({
      sourceDir: stagingRoot,
      ...(request.limits === undefined ? {} : { limits: request.limits })
    })
    assertSameArtifact(source, staged)
    await mkdir(dirname(finalRoot), { recursive: true })
    let reused = false
    try {
      await rename(stagingRoot, finalRoot)
    } catch (error) {
      if (!(await exists(finalRoot)) || !isRenameConflict(error)) {
        throw error
      }
      const existing = await inspectLocalPluginPackage({
        sourceDir: finalRoot,
        ...(request.limits === undefined ? {} : { limits: request.limits })
      })
      assertSameArtifact(source, existing)
      reused = true
    }
    await sealPackage(finalRoot, source)
    const installed = await inspectLocalPluginPackage({
      sourceDir: finalRoot,
      ...(request.limits === undefined ? {} : { limits: request.limits })
    })
    assertSameArtifact(source, installed)
    return { installRootDir: finalRoot, reused, source, installed }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

async function copyPackage(
  inspection: LocalPluginPackageInspection,
  destination: string
): Promise<void> {
  const paths = [LOCAL_PLUGIN_MANIFEST_FILE, ...inspection.files.map((file) => file.path)]
  for (const path of paths) {
    const target = join(destination, path)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(inspection.sourceDir, path), target)
  }
}

async function sealPackage(
  root: string,
  inspection: LocalPluginPackageInspection
): Promise<void> {
  if (process.platform === "win32") {
    return
  }
  await chmod(join(root, LOCAL_PLUGIN_MANIFEST_FILE), 0o444)
  for (const file of inspection.files) {
    await chmod(join(root, file.path), file.executable ? 0o555 : 0o444)
  }
  const directories = new Set<string>([root])
  for (const file of inspection.files) {
    let current = dirname(join(root, file.path))
    while (isWithin(root, current)) {
      directories.add(current)
      if (current === root) {
        break
      }
      current = dirname(current)
    }
  }
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    await chmod(directory, 0o555)
  }
}

function assertSameArtifact(
  expected: LocalPluginPackageInspection,
  actual: LocalPluginPackageInspection
): void {
  if (
    actual.artifactSha256 !== expected.artifactSha256 ||
    actual.manifestSha256 !== expected.manifestSha256 ||
    JSON.stringify(actual.files) !== JSON.stringify(expected.files)
  ) {
    throw new Error("local plugin package materialized artifact differs from inspection")
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

function isRenameConflict(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    ["EACCES", "EEXIST", "ENOTEMPTY", "EPERM"].includes(String(error.code))
}

function requireSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("local plugin package expectedArtifactSha256 is invalid")
  }
}
