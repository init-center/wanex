import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, lstat, readFile, realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path"

export const WANEX_RUNTIME_ARTIFACTS = "wanex-runtime-artifacts" as const

export interface RuntimeArtifactManifest {
  readonly kind: "wanex.runtime-artifacts"
  readonly releaseVersion: string
  readonly serviceVersion: string
  readonly targets: readonly RuntimeArtifactTarget[]
}

export interface RuntimeArtifactTarget {
  readonly id: string
  readonly rustTarget: string
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
  readonly systemService: RuntimeSystemServiceArtifact
}

export interface RuntimeSystemServiceArtifact {
  readonly kind: "executable"
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

export interface RuntimeArtifactEnvironment {
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
}

export interface ResolveSystemServiceBinaryOptions {
  readonly explicitPath?: string
  readonly env?: RuntimeArtifactEnvironment
  readonly manifest?: unknown
  readonly artifactDir?: string
  readonly platform?: NodeJS.Platform
  readonly arch?: NodeJS.Architecture
  readonly checkExecutable?: boolean
}

export interface ResolvedSystemServiceBinary {
  readonly path: string
  readonly source: RuntimeArtifactSource
  readonly target?: RuntimeArtifactTargetIdentity
  readonly bytes?: number
  readonly sha256?: string
}

export interface RuntimeArtifactTargetIdentity {
  readonly id: string
  readonly rustTarget: string
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
}

export type RuntimeArtifactSource =
  | "explicit"
  | "environment"
  | "manifest"
  | "package"

export class RuntimeArtifactResolutionError extends Error {
  readonly code: RuntimeArtifactResolutionErrorCode
  readonly candidates: readonly RuntimeArtifactCandidate[]

  constructor(
    message: string,
    options: {
      readonly code: RuntimeArtifactResolutionErrorCode
      readonly candidates?: readonly RuntimeArtifactCandidate[]
    }
  ) {
    super(message)
    this.name = "RuntimeArtifactResolutionError"
    this.code = options.code
    this.candidates = options.candidates ?? []
  }
}

export type RuntimeArtifactResolutionErrorCode =
  | "runtime_artifact_missing_system_service"
  | "runtime_artifact_not_executable"
  | "runtime_artifact_manifest_invalid"
  | "runtime_artifact_manifest_root_missing"
  | "runtime_artifact_target_missing"
  | "runtime_artifact_path_escape"
  | "runtime_artifact_not_file"
  | "runtime_artifact_size_mismatch"
  | "runtime_artifact_checksum_mismatch"

export interface RuntimeArtifactCandidate {
  readonly source: RuntimeArtifactSource
  readonly path: string
}

const supportedTargets = new Map([
  ["linux-x64", "x86_64-unknown-linux-gnu"],
  ["darwin-arm64", "aarch64-apple-darwin"],
  ["darwin-x64", "x86_64-apple-darwin"],
  ["win32-x64", "x86_64-pc-windows-msvc"]
])

const nativePackageByTarget = new Map([
  ["linux-x64", "@wanex/system-service-linux-x64"],
  ["darwin-arm64", "@wanex/system-service-darwin-arm64"],
  ["darwin-x64", "@wanex/system-service-darwin-x64"],
  ["win32-x64", "@wanex/system-service-win32-x64"]
])

export async function resolveSystemServiceBinary(
  options: ResolveSystemServiceBinaryOptions = {}
): Promise<ResolvedSystemServiceBinary> {
  const normalizedOptions = {
    ...options,
    env: options.env ?? process.env
  }
  const candidates = trustedSystemServiceBinaryCandidates(normalizedOptions)
  const checkExecutable = options.checkExecutable ?? true

  for (const candidate of candidates) {
    try {
      await access(
        candidate.path,
        checkExecutable ? constants.X_OK : constants.F_OK
      )
      return {
        path: candidate.path,
        source: candidate.source
      }
    } catch {
      // Trusted development overrides retain ordered fallback behavior.
    }
  }

  if (options.manifest !== undefined || options.artifactDir !== undefined) {
    if (options.manifest === undefined || options.artifactDir === undefined) {
      throw artifactError(
        "runtime_artifact_manifest_root_missing",
        "packaged artifact resolution requires both manifest and artifactDir",
        candidates
      )
    }
    return await resolveManifestSystemService({
      manifest: parseRuntimeArtifactManifest(options.manifest),
      artifactDir: options.artifactDir,
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
      checkExecutable,
      source: "manifest"
    })
  }

  return await resolveInstalledSystemService({
    platform: options.platform ?? process.platform,
    arch: options.arch ?? process.arch,
    checkExecutable,
    priorCandidates: candidates
  })
}

export function systemServiceBinaryCandidates(
  options: ResolveSystemServiceBinaryOptions = {}
): readonly RuntimeArtifactCandidate[] {
  const candidates = trustedSystemServiceBinaryCandidates(options)
  if (options.manifest !== undefined && options.artifactDir !== undefined) {
    const manifest = parseRuntimeArtifactManifest(options.manifest)
    const target = manifest.targets.find((item) =>
      item.platform === (options.platform ?? process.platform) &&
      item.arch === (options.arch ?? process.arch)
    )
    if (target !== undefined) {
      candidates.push({
        source: "manifest",
        path: resolve(options.artifactDir, target.systemService.path)
      })
    }
  }
  return candidates
}

export function parseRuntimeArtifactManifest(
  input: unknown
): RuntimeArtifactManifest {
  if (!isRecord(input) || !hasExactKeys(input, [
    "kind",
    "releaseVersion",
    "serviceVersion",
    "targets"
  ])) {
    throw invalidManifest("artifact manifest must be a closed object")
  }
  if (
    input.kind !== "wanex.runtime-artifacts" ||
    !nonEmpty(input.releaseVersion) ||
    !nonEmpty(input.serviceVersion) ||
    !Array.isArray(input.targets) ||
    input.targets.length === 0
  ) {
    throw invalidManifest("artifact manifest is invalid")
  }
  const targets = input.targets.map((value, index) =>
    parseTarget(value, index)
  )
  const targetIds = new Set<string>()
  const platformArches = new Set<string>()
  for (const target of targets) {
    const platformArch = `${target.platform}-${target.arch}`
    if (targetIds.has(target.id) || platformArches.has(platformArch)) {
      throw invalidManifest(`artifact manifest target is duplicated: ${target.id}`)
    }
    targetIds.add(target.id)
    platformArches.add(platformArch)
  }
  return {
    kind: "wanex.runtime-artifacts",
    releaseVersion: input.releaseVersion,
    serviceVersion: input.serviceVersion,
    targets
  }
}

async function resolveManifestSystemService(request: {
  readonly manifest: RuntimeArtifactManifest
  readonly artifactDir: string
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
  readonly checkExecutable: boolean
  readonly source: "manifest" | "package"
}): Promise<ResolvedSystemServiceBinary> {
  validateManifest(request.manifest)
  const target = request.manifest.targets.find((item) =>
    item.platform === request.platform && item.arch === request.arch
  )
  if (target === undefined) {
    throw artifactError(
      "runtime_artifact_target_missing",
      `artifact manifest has no target for ${request.platform}-${request.arch}`
    )
  }
  validateExecutableName(target)
  const root = resolve(request.artifactDir)
  const candidate = resolveContainedArtifactPath(root, target.systemService.path)
  const candidateInfo = [{ source: request.source, path: candidate }]
  let rootRealPath: string
  let candidateRealPath: string
  try {
    ;[rootRealPath, candidateRealPath] = await Promise.all([
      realpath(root),
      realpath(candidate)
    ])
  } catch {
    throw artifactError(
      "runtime_artifact_not_file",
      "manifest system-service artifact does not exist",
      candidateInfo
    )
  }
  assertContained(rootRealPath, candidateRealPath, candidateInfo)
  const status = await lstat(candidateRealPath)
  if (!status.isFile()) {
    throw artifactError(
      "runtime_artifact_not_file",
      "manifest system-service artifact must be a regular file",
      candidateInfo
    )
  }
  if (status.size !== target.systemService.bytes) {
    throw artifactError(
      "runtime_artifact_size_mismatch",
      `manifest system-service size differs: expected ${target.systemService.bytes}, received ${status.size}`,
      candidateInfo
    )
  }
  const bytes = await readFile(candidateRealPath)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== target.systemService.sha256) {
    throw artifactError(
      "runtime_artifact_checksum_mismatch",
      "manifest system-service SHA-256 differs",
      candidateInfo
    )
  }
  try {
    await access(
      candidateRealPath,
      request.checkExecutable ? constants.X_OK : constants.F_OK
    )
  } catch {
    throw artifactError(
      "runtime_artifact_not_executable",
      `manifest system-service artifact is not ${
        request.checkExecutable ? "executable" : "readable"
      }`,
      candidateInfo
    )
  }
  return {
    path: candidateRealPath,
    source: request.source,
    target: {
      id: target.id,
      rustTarget: target.rustTarget,
      platform: target.platform,
      arch: target.arch
    },
    bytes: target.systemService.bytes,
    sha256
  }
}

async function resolveInstalledSystemService(request: {
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
  readonly checkExecutable: boolean
  readonly priorCandidates: readonly RuntimeArtifactCandidate[]
}): Promise<ResolvedSystemServiceBinary> {
  const targetId = `${request.platform}-${request.arch}`
  const packageName = nativePackageByTarget.get(targetId)
  if (packageName === undefined) {
    throw artifactError(
      "runtime_artifact_target_missing",
      `Wanex has no native System Service package for ${targetId}`,
      request.priorCandidates
    )
  }
  const manifestSpecifier = `${packageName}/runtime-artifacts.json`
  const packageCandidate = {
    source: "package" as const,
    path: manifestSpecifier
  }
  const runtimeRequire = createRuntimePackageRequire()
  let manifestPath: string
  try {
    manifestPath = runtimeRequire.resolve(manifestSpecifier)
  } catch (error) {
    if (isModuleNotFound(error)) {
      throw artifactError(
        "runtime_artifact_missing_system_service",
        `missing optional native package ${packageName} for ${targetId}`,
        [...request.priorCandidates, packageCandidate]
      )
    }
    throw artifactError(
      "runtime_artifact_manifest_invalid",
      `cannot resolve native package manifest ${manifestSpecifier}`,
      [...request.priorCandidates, packageCandidate]
    )
  }

  let manifest: RuntimeArtifactManifest
  try {
    manifest = parseRuntimeArtifactManifest(
      JSON.parse(await readFile(manifestPath, "utf8"))
    )
  } catch (error) {
    if (error instanceof RuntimeArtifactResolutionError) {
      throw artifactError(
        error.code,
        `native package ${packageName} has an invalid artifact manifest: ${error.message}`,
        [...request.priorCandidates, { source: "package", path: manifestPath }]
      )
    }
    throw artifactError(
      "runtime_artifact_manifest_invalid",
      `native package ${packageName} has an unreadable artifact manifest`,
      [...request.priorCandidates, { source: "package", path: manifestPath }]
    )
  }
  if (manifest.targets.length !== 1 || manifest.targets[0]?.id !== targetId) {
    throw artifactError(
      "runtime_artifact_manifest_invalid",
      `native package ${packageName} must contain exactly target ${targetId}`,
      [...request.priorCandidates, { source: "package", path: manifestPath }]
    )
  }
  return await resolveManifestSystemService({
    manifest,
    artifactDir: dirname(manifestPath),
    platform: request.platform,
    arch: request.arch,
    checkExecutable: request.platform === "win32"
      ? false
      : request.checkExecutable,
    source: "package"
  })
}

function validateManifest(manifest: RuntimeArtifactManifest): void {
  parseRuntimeArtifactManifest(manifest)
}

function parseTarget(input: unknown, index: number): RuntimeArtifactTarget {
  if (!isRecord(input) || !hasExactKeys(input, [
    "id",
    "rustTarget",
    "platform",
    "arch",
    "systemService"
  ])) {
    throw invalidManifest(`artifact manifest target ${index} must be a closed object`)
  }
  const platformArch = `${String(input.platform)}-${String(input.arch)}`
  const expectedRustTarget = supportedTargets.get(platformArch)
  if (
    !nonEmpty(input.id) ||
    input.id !== platformArch ||
    !nonEmpty(input.rustTarget) ||
    input.rustTarget !== expectedRustTarget ||
    !isNodePlatform(input.platform) ||
    !isNodeArchitecture(input.arch)
  ) {
    throw invalidManifest(`artifact manifest target is invalid: ${String(input.id)}`)
  }
  return {
    id: input.id,
    rustTarget: input.rustTarget,
    platform: input.platform,
    arch: input.arch,
    systemService: parseSystemService(input.systemService, input.id)
  }
}

function parseSystemService(
  input: unknown,
  targetId: string
): RuntimeSystemServiceArtifact {
  if (!isRecord(input) || !hasExactKeys(input, [
    "kind",
    "path",
    "bytes",
    "sha256"
  ])) {
    throw invalidManifest(`system-service artifact is invalid: ${targetId}`)
  }
  if (
    input.kind !== "executable" ||
    !nonEmpty(input.path) ||
    !Number.isSafeInteger(input.bytes) ||
    (input.bytes as number) <= 0 ||
    typeof input.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.sha256)
  ) {
    throw invalidManifest(`system-service artifact is invalid: ${targetId}`)
  }
  return {
    kind: "executable",
    path: input.path,
    bytes: input.bytes as number,
    sha256: input.sha256
  }
}

function validateExecutableName(target: RuntimeArtifactTarget): void {
  const name = basename(target.systemService.path).toLowerCase()
  const valid = target.platform === "win32"
    ? name === "wanex-system-service.exe"
    : name === "wanex-system-service"
  if (!valid) {
    throw artifactError(
      "runtime_artifact_manifest_invalid",
      `system-service executable name is invalid for ${target.platform}`
    )
  }
}

function resolveContainedArtifactPath(root: string, manifestPath: string): string {
  if (
    isAbsolute(manifestPath) ||
    manifestPath.includes("\\") ||
    manifestPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw artifactError(
      "runtime_artifact_path_escape",
      "manifest artifact path must be a confined relative POSIX path"
    )
  }
  const candidate = resolve(root, ...manifestPath.split("/"))
  assertContained(root, candidate)
  return candidate
}

function assertContained(
  root: string,
  candidate: string,
  candidates: readonly RuntimeArtifactCandidate[] = []
): void {
  const fromRoot = relative(root, candidate)
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw artifactError(
      "runtime_artifact_path_escape",
      "manifest artifact path escapes artifactDir",
      candidates
    )
  }
}

function trustedSystemServiceBinaryCandidates(
  options: ResolveSystemServiceBinaryOptions
): RuntimeArtifactCandidate[] {
  const candidates: RuntimeArtifactCandidate[] = []
  pushTrustedCandidate(candidates, "explicit", options.explicitPath)
  pushTrustedCandidate(
    candidates,
    "environment",
    options.env?.WANEX_SYSTEM_SERVICE_BIN
  )
  return candidates
}

function pushTrustedCandidate(
  candidates: RuntimeArtifactCandidate[],
  source: "explicit" | "environment",
  path: string | undefined
): void {
  if (path === undefined || path.length === 0) return
  candidates.push({ source, path: isAbsolute(path) ? path : resolve(path) })
}

function artifactError(
  code: RuntimeArtifactResolutionErrorCode,
  message: string,
  candidates: readonly RuntimeArtifactCandidate[] = []
): RuntimeArtifactResolutionError {
  return new RuntimeArtifactResolutionError(message, { code, candidates })
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value).sort()
  const required = [...expected].sort()
  return keys.length === required.length &&
    keys.every((key, index) => key === required[index])
}

function isNodePlatform(value: unknown): value is NodeJS.Platform {
  return value === "linux" || value === "darwin" || value === "win32"
}

function isNodeArchitecture(value: unknown): value is NodeJS.Architecture {
  return value === "arm64" || value === "x64"
}

function invalidManifest(message: string): RuntimeArtifactResolutionError {
  return artifactError("runtime_artifact_manifest_invalid", message)
}

function isModuleNotFound(
  error: unknown
): error is NodeJS.ErrnoException & { readonly code: "MODULE_NOT_FOUND" } {
  return error instanceof Error &&
    "code" in error &&
    error.code === "MODULE_NOT_FOUND"
}

function createRuntimePackageRequire(): NodeRequire {
  return createRequire(
    typeof __filename === "string" ? __filename : import.meta.url
  )
}
