import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"
import {
  parseRuntimeArtifactManifest,
  type RuntimeArtifactManifest
} from "../../packages/runtime/src/bootstrap/index.js"
import { resolveStepCommand } from "../process-step.mjs"
import {
  loadSdkDistributionPolicy,
  nativePackageForHost,
  nativePackageForTarget
} from "../sdk/distribution-policy.mjs"
import { createNativeNpmPackageManifest } from "../sdk/native-package-manifest.mjs"
import {
  auditNativeArtifactDirectory,
  NATIVE_ARTIFACT_MANIFEST_FILE
} from "./staging.js"

const execFileAsync = promisify(execFile)

export interface CreateNativeNpmPackageOptions {
  readonly workspaceRoot: string
  readonly targetId: string
  readonly artifactDir?: string
  readonly outputDir?: string
}

export interface NativeNpmPackageReceipt {
  readonly name: string
  readonly version: string
  readonly targetId: string
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
  readonly rustTarget: string
  readonly outputDir: string
  readonly stagingDir: string
  readonly tarballPath: string
  readonly filename: string
  readonly bytes: number
  readonly sha256: string
  readonly executableBytes: number
  readonly executableSha256: string
  readonly files: readonly NativeNpmPackageFile[]
}

export interface NativeNpmPackageFile {
  readonly path: string
  readonly bytes: number
}

export interface NativeNpmPackageCliOptions {
  readonly targetId?: string
  readonly artifactDir?: string
  readonly outputDir?: string
}

export function parseNativeNpmPackageArgs(
  values: readonly string[]
): NativeNpmPackageCliOptions {
  const parsed: {
    targetId?: string
    artifactDir?: string
    outputDir?: string
  } = {}
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index]
    if (name === "--") continue
    const value = values[index + 1]
    if (
      name !== "--target" &&
      name !== "--artifact-dir" &&
      name !== "--output-dir"
    ) {
      throw new Error(`unknown native npm package argument: ${String(name)}`)
    }
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") parsed.targetId = value
    if (name === "--artifact-dir") parsed.artifactDir = resolve(value)
    if (name === "--output-dir") parsed.outputDir = resolve(value)
    index += 1
  }
  return parsed
}

export async function createNativeNpmPackage(
  options: CreateNativeNpmPackageOptions
): Promise<NativeNpmPackageReceipt> {
  const workspaceRoot = resolve(options.workspaceRoot)
  const policy = await loadSdkDistributionPolicy()
  const nativePackage = nativePackageForTarget(policy, options.targetId)
  const hostPackage = nativePackageForHost(policy)
  if (hostPackage.targetId !== nativePackage.targetId) {
    throw new Error(
      "native npm package must be produced on its target host: " +
      `selected=${nativePackage.targetId} host=${hostPackage.targetId}`
    )
  }
  const artifactDir = resolve(
    options.artifactDir ??
      join(workspaceRoot, "target/distribution/native")
  )
  const outputDir = resolve(
    options.outputDir ??
      join(workspaceRoot, "target/sdk/native", nativePackage.targetId)
  )
  assertOutputUnderTarget(workspaceRoot, outputDir)

  const staged = await auditNativeArtifactDirectory({
    outputDir: artifactDir,
    targetId: nativePackage.targetId
  })
  const manifest = parseRuntimeArtifactManifest(
    JSON.parse(await readFile(staged.manifestPath, "utf8"))
  )
  validateNativeManifest(manifest, nativePackage)

  await rm(outputDir, { recursive: true, force: true })
  const stagingDir = join(outputDir, "staging")
  const tarballDir = join(outputDir, "tarballs")
  await Promise.all([
    mkdir(join(stagingDir, nativePackage.targetId), { recursive: true }),
    mkdir(tarballDir, { recursive: true })
  ])

  const target = manifest.targets[0]!
  const packagedManifestPath = join(
    stagingDir,
    NATIVE_ARTIFACT_MANIFEST_FILE
  )
  const packagedExecutablePath = join(
    stagingDir,
    ...target.systemService.path.split("/")
  )
  await Promise.all([
    copyFile(staged.manifestPath, packagedManifestPath),
    copyFile(staged.executablePath, packagedExecutablePath)
  ])
  if (nativePackage.platform !== "win32") {
    await chmod(packagedExecutablePath, 0o755)
  }

  const packageManifest = createNativeNpmPackageManifest(
    nativePackage,
    manifest.releaseVersion
  )
  await writeFile(
    join(stagingDir, "package.json"),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    "utf8"
  )

  const expectedFiles = [
    "package.json",
    NATIVE_ARTIFACT_MANIFEST_FILE,
    target.systemService.path
  ].sort()
  const stagingFiles = await listFiles(stagingDir)
  if (JSON.stringify(stagingFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `native npm staging contains unexpected files: ${stagingFiles.join(",")}`
    )
  }

  const packCommand = resolveStepCommand({
    command: "npm",
    args: [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      tarballDir
    ]
  })
  const { stdout } = await execFileAsync(packCommand.command, packCommand.args, {
    cwd: stagingDir,
    maxBuffer: 10 * 1024 * 1024
  })
  const packedOutput = JSON.parse(stdout)
  const packed = Array.isArray(packedOutput) ? packedOutput[0] : packedOutput
  if (
    typeof packed?.filename !== "string" ||
    !Array.isArray(packed.files)
  ) {
    throw new Error(`npm pack returned no artifact for ${nativePackage.name}`)
  }
  const packedFiles = packed.files
    .map((file: { readonly path?: unknown }) => file.path)
    .sort()
  if (JSON.stringify(packedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `native npm tarball contains unexpected files: ${packedFiles.join(",")}`
    )
  }
  const packedExecutable = packed.files.find(
    (file: { readonly path?: unknown }) =>
      file.path === target.systemService.path
  )
  if (
    nativePackage.platform !== "win32" &&
    packedExecutable?.mode !== 0o755
  ) {
    throw new Error(
      `native npm tarball executable mode differs: ${String(packedExecutable?.mode)}`
    )
  }

  const filename = basename(packed.filename)
  const tarballPath = join(tarballDir, filename)
  const tarball = await readFile(tarballPath)
  const files = await Promise.all(expectedFiles.map(async (path) => ({
    path,
    bytes: (await stat(join(stagingDir, ...path.split("/")))).size
  })))
  const receipt: NativeNpmPackageReceipt = {
    name: nativePackage.name,
    version: manifest.releaseVersion,
    targetId: nativePackage.targetId,
    platform: nativePackage.platform,
    arch: nativePackage.arch,
    rustTarget: nativePackage.rustTarget,
    outputDir,
    stagingDir,
    tarballPath,
    filename,
    bytes: tarball.byteLength,
    sha256: createHash("sha256").update(tarball).digest("hex"),
    executableBytes: staged.bytes,
    executableSha256: staged.sha256,
    files
  }
  const portableReceipt = {
    ...receipt,
    outputDir: portableWorkspacePath(workspaceRoot, receipt.outputDir),
    stagingDir: portableWorkspacePath(workspaceRoot, receipt.stagingDir),
    tarballPath: portableWorkspacePath(workspaceRoot, receipt.tarballPath)
  }
  await writeFile(
    join(outputDir, "report.json"),
    `${JSON.stringify(portableReceipt, null, 2)}\n`,
    "utf8"
  )
  return receipt
}

function validateNativeManifest(
  manifest: RuntimeArtifactManifest,
  nativePackage: {
    readonly targetId: string
    readonly platform: NodeJS.Platform
    readonly arch: NodeJS.Architecture
    readonly rustTarget: string
  }
): void {
  if (manifest.targets.length !== 1) {
    throw new Error("native npm package requires exactly one artifact target")
  }
  const target = manifest.targets[0]!
  if (
    target.id !== nativePackage.targetId ||
    target.platform !== nativePackage.platform ||
    target.arch !== nativePackage.arch ||
    target.rustTarget !== nativePackage.rustTarget
  ) {
    throw new Error(
      `native npm package target differs from policy: ${nativePackage.targetId}`
    )
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path))
    } else {
      files.push(relative(root, path).split(sep).join("/"))
    }
  }
  return files.sort()
}

function assertOutputUnderTarget(
  workspaceRoot: string,
  outputDir: string
): void {
  const targetRoot = resolve(workspaceRoot, "target")
  const fromTarget = relative(targetRoot, outputDir)
  if (
    fromTarget === "" ||
    fromTarget === ".." ||
    fromTarget.startsWith("../") ||
    fromTarget.startsWith("..\\")
  ) {
    throw new Error("native npm outputDir must be below workspace target")
  }
}

function portableWorkspacePath(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).split(sep).join("/")
}
