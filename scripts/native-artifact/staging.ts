import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { promisify } from "node:util"
import {
  parseRuntimeArtifactManifest,
  resolveSystemServiceBinary,
  type RuntimeArtifactManifest,
  type RuntimeArtifactTarget
} from "../../packages/runtime/src/bootstrap/index.js"

const execFileAsync = promisify(execFile)

export const NATIVE_ARTIFACT_MANIFEST_FILE = "runtime-artifacts.json"

const targetById = new Map<string, Omit<RuntimeArtifactTarget, "systemService">>([
  ["darwin-arm64", {
    id: "darwin-arm64",
    rustTarget: "aarch64-apple-darwin",
    platform: "darwin",
    arch: "arm64"
  }],
  ["darwin-x64", {
    id: "darwin-x64",
    rustTarget: "x86_64-apple-darwin",
    platform: "darwin",
    arch: "x64"
  }],
  ["win32-x64", {
    id: "win32-x64",
    rustTarget: "x86_64-pc-windows-msvc",
    platform: "win32",
    arch: "x64"
  }]
])

export interface StageNativeArtifactOptions {
  readonly workspaceRoot: string
  readonly targetId: string
  readonly outputDir?: string
  readonly sourceBin?: string
  readonly releaseVersion?: string
  readonly serviceVersion?: string
  readonly build?: boolean
}

export interface NativeArtifactStageReceipt {
  readonly targetId: string
  readonly rustTarget: string
  readonly outputDir: string
  readonly manifestPath: string
  readonly executablePath: string
  readonly bytes: number
  readonly sha256: string
  readonly fileCount: number
}

export async function stageNativeArtifact(
  options: StageNativeArtifactOptions
): Promise<NativeArtifactStageReceipt> {
  const workspaceRoot = resolve(options.workspaceRoot)
  const configured = targetById.get(options.targetId)
  if (configured === undefined) {
    throw new Error(`unsupported native artifact target: ${options.targetId}`)
  }
  const outputDir = resolve(
    options.outputDir ?? join(workspaceRoot, "target/distribution/native")
  )
  assertOutputUnderTarget(workspaceRoot, outputDir)
  const versions = await resolveVersions({
    workspaceRoot,
    releaseVersion: options.releaseVersion,
    serviceVersion: options.serviceVersion
  })
  const hostRustTarget = options.sourceBin === undefined
    ? await readRustHostTarget(workspaceRoot)
    : undefined
  const nativeHostBuild = hostRustTarget === configured.rustTarget
  const sourceBin = options.sourceBin === undefined
    ? nativeCargoBinary(workspaceRoot, configured, nativeHostBuild)
    : resolve(options.sourceBin)
  if (options.sourceBin === undefined && options.build !== false) {
    await execFileAsync("cargo", [
      "build",
      "--release",
      ...(nativeHostBuild ? [] : ["--target", configured.rustTarget]),
      "-p",
      "wanex-system-service"
    ], {
      cwd: workspaceRoot,
      maxBuffer: 20 * 1024 * 1024
    })
  }
  const sourceStatus = await stat(sourceBin)
  if (!sourceStatus.isFile()) {
    throw new Error(`native artifact source is not a file: ${sourceBin}`)
  }

  await rm(outputDir, { recursive: true, force: true })
  const targetDir = join(outputDir, configured.id)
  await mkdir(targetDir, { recursive: true })
  const executableName = configured.platform === "win32"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  const executablePath = join(targetDir, executableName)
  await copyFile(sourceBin, executablePath)
  if (configured.platform !== "win32") await chmod(executablePath, 0o755)

  const binary = await readFile(executablePath)
  const sha256 = createHash("sha256").update(binary).digest("hex")
  const manifest: RuntimeArtifactManifest = {
    kind: "wanex.runtime-artifacts",
    releaseVersion: versions.releaseVersion,
    serviceVersion: versions.serviceVersion,
    targets: [{
      ...configured,
      systemService: {
        kind: "executable",
        path: `${configured.id}/${executableName}`,
        bytes: binary.byteLength,
        sha256
      }
    }]
  }
  parseRuntimeArtifactManifest(manifest)
  const manifestPath = join(outputDir, NATIVE_ARTIFACT_MANIFEST_FILE)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  const receipt = await auditNativeArtifactDirectory({
    outputDir,
    targetId: configured.id
  })
  return receipt
}

export async function auditNativeArtifactDirectory(options: {
  readonly outputDir: string
  readonly targetId: string
}): Promise<NativeArtifactStageReceipt> {
  const outputDir = resolve(options.outputDir)
  const configured = targetById.get(options.targetId)
  if (configured === undefined) {
    throw new Error(`unsupported native artifact target: ${options.targetId}`)
  }
  const manifestPath = join(outputDir, NATIVE_ARTIFACT_MANIFEST_FILE)
  const manifest = parseRuntimeArtifactManifest(
    JSON.parse(await readFile(manifestPath, "utf8"))
  )
  if (manifest.targets.length !== 1 || manifest.targets[0]?.id !== configured.id) {
    throw new Error("native artifact directory must contain exactly its selected target")
  }
  const resolved = await resolveSystemServiceBinary({
    manifest,
    artifactDir: outputDir,
    platform: configured.platform,
    arch: configured.arch,
    checkExecutable: configured.platform !== "win32"
  })
  const files = await listFiles(outputDir)
  const expectedFiles = [
    NATIVE_ARTIFACT_MANIFEST_FILE,
    manifest.targets[0].systemService.path
  ].sort()
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `native artifact directory contains unexpected files: ${files.join(",")}`
    )
  }
  return {
    targetId: configured.id,
    rustTarget: configured.rustTarget,
    outputDir,
    manifestPath,
    executablePath: resolved.path,
    bytes: resolved.bytes!,
    sha256: resolved.sha256!,
    fileCount: files.length
  }
}

export function nativeTargetId(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  const id = `${platform}-${arch}`
  if (!targetById.has(id)) throw new Error(`unsupported native host target: ${id}`)
  return id
}

function nativeCargoBinary(
  workspaceRoot: string,
  target: Omit<RuntimeArtifactTarget, "systemService">,
  nativeHostBuild: boolean
): string {
  return join(
    workspaceRoot,
    "target",
    ...(nativeHostBuild ? [] : [target.rustTarget]),
    "release",
    target.platform === "win32"
      ? "wanex-system-service.exe"
      : "wanex-system-service"
  )
}

async function readRustHostTarget(workspaceRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("rustc", ["-vV"], {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024
  })
  const host = stdout.split(/\r?\n/).find((line) => line.startsWith("host: "))
    ?.slice("host: ".length)
  if (!nonEmpty(host)) throw new Error("rustc did not report its host target")
  return host
}

async function resolveVersions(options: {
  readonly workspaceRoot: string
  readonly releaseVersion?: string
  readonly serviceVersion?: string
}): Promise<{ releaseVersion: string; serviceVersion: string }> {
  const releaseVersion = options.releaseVersion ?? JSON.parse(
    await readFile(join(options.workspaceRoot, "package.json"), "utf8")
  ).version
  let serviceVersion = options.serviceVersion
  if (serviceVersion === undefined) {
    const { stdout } = await execFileAsync("cargo", [
      "metadata",
      "--format-version",
      "1",
      "--no-deps"
    ], {
      cwd: options.workspaceRoot,
      maxBuffer: 20 * 1024 * 1024
    })
    const metadata = JSON.parse(stdout)
    serviceVersion = metadata.packages.find(
      (item: { readonly name?: string }) => item.name === "wanex-system-service"
    )?.version
  }
  if (!nonEmpty(releaseVersion) || !nonEmpty(serviceVersion)) {
    throw new Error("native artifact release and service versions are required")
  }
  return { releaseVersion, serviceVersion }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path))
    } else if (entry.isFile()) {
      files.push(relative(root, path).replaceAll("\\", "/"))
    } else {
      files.push(relative(root, path).replaceAll("\\", "/"))
    }
  }
  return files.sort()
}

function assertOutputUnderTarget(workspaceRoot: string, outputDir: string): void {
  const targetRoot = resolve(workspaceRoot, "target")
  const fromTarget = relative(targetRoot, outputDir)
  if (
    fromTarget === "" ||
    fromTarget === ".." ||
    fromTarget.startsWith("../") ||
    fromTarget.startsWith("..\\")
  ) {
    throw new Error("native artifact outputDir must be below workspace target")
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
