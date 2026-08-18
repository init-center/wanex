import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import type {
  WanexLocalKeychainBinding
} from "@wanex/local-credential-store/binding"

export const WANEX_DESKTOP_CREDENTIAL_ARTIFACT_KIND =
  "wanex.desktop-credential-artifact" as const
export const WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE =
  "desktop-credential-artifact.json" as const

export interface WanexDesktopCredentialArtifactManifest {
  readonly kind: typeof WANEX_DESKTOP_CREDENTIAL_ARTIFACT_KIND
  readonly version: 1
  readonly target: {
    readonly id: string
    readonly platform: NodeJS.Platform
    readonly arch: NodeJS.Architecture
  }
  readonly keyring: {
    readonly kind: "node-api-module"
    readonly path: "keyring.node"
    readonly bytes: number
    readonly sha256: string
  }
}

export interface ResolvedWanexDesktopCredentialArtifact {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly targetId: string
}

export async function resolveWanexDesktopCredentialArtifact(options: {
  readonly manifest: unknown
  readonly artifactDir: string
  readonly platform?: NodeJS.Platform
  readonly arch?: NodeJS.Architecture
}): Promise<ResolvedWanexDesktopCredentialArtifact> {
  const manifest = parseWanexDesktopCredentialArtifactManifest(options.manifest)
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const targetId = desktopTargetId(platform, arch)
  if (
    manifest.target.id !== targetId ||
    manifest.target.platform !== platform ||
    manifest.target.arch !== arch
  ) {
    throw new Error(`desktop credential artifact target mismatch: expected ${targetId}`)
  }

  const artifactRoot = await realpath(options.artifactDir)
  const candidate = resolve(artifactRoot, manifest.keyring.path)
  if (
    isAbsolute(manifest.keyring.path) ||
    !isPathInside(artifactRoot, candidate)
  ) {
    throw new Error("desktop credential artifact path escapes its root")
  }
  const candidateRealPath = await realpath(candidate)
  if (!isPathInside(artifactRoot, candidateRealPath)) {
    throw new Error("desktop credential artifact real path escapes its root")
  }
  const status = await lstat(candidateRealPath)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("desktop credential artifact is not a regular file")
  }
  if (status.size !== manifest.keyring.bytes) {
    throw new Error("desktop credential artifact size mismatch")
  }
  const bytes = await readFile(candidateRealPath)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== manifest.keyring.sha256) {
    throw new Error("desktop credential artifact checksum mismatch")
  }
  return {
    path: candidateRealPath,
    bytes: status.size,
    sha256,
    targetId
  }
}

export async function loadWanexDesktopCredentialBinding(options: {
  readonly artifact: ResolvedWanexDesktopCredentialArtifact
  readonly load?: (path: string) => unknown
}): Promise<WanexLocalKeychainBinding> {
  const loaded = (options.load ?? defaultNativeLoader)(options.artifact.path)
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    !("Entry" in loaded) ||
    typeof loaded.Entry !== "function"
  ) {
    throw new Error("desktop credential artifact does not export Entry")
  }
  return loaded as WanexLocalKeychainBinding
}

export function parseWanexDesktopCredentialArtifactManifest(
  value: unknown
): WanexDesktopCredentialArtifactManifest {
  const record = requireClosedRecord(value, ["kind", "version", "target", "keyring"])
  const target = requireClosedRecord(record.target, ["id", "platform", "arch"])
  const keyring = requireClosedRecord(record.keyring, [
    "kind",
    "path",
    "bytes",
    "sha256"
  ])
  if (
    record.kind !== WANEX_DESKTOP_CREDENTIAL_ARTIFACT_KIND ||
    record.version !== 1 ||
    typeof target.id !== "string" ||
    typeof target.platform !== "string" ||
    typeof target.arch !== "string" ||
    keyring.kind !== "node-api-module" ||
    keyring.path !== "keyring.node" ||
    !Number.isSafeInteger(keyring.bytes) ||
    (keyring.bytes as number) <= 0 ||
    typeof keyring.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(keyring.sha256)
  ) {
    throw new Error("desktop credential artifact manifest is invalid")
  }
  desktopTargetId(
    target.platform as NodeJS.Platform,
    target.arch as NodeJS.Architecture
  )
  return value as WanexDesktopCredentialArtifactManifest
}

export function desktopTargetId(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): string {
  const id = `${platform}-${arch}`
  if (!new Set(["darwin-arm64", "darwin-x64", "win32-x64"]).has(id)) {
    throw new Error(`unsupported desktop target: ${id}`)
  }
  return id
}

function defaultNativeLoader(path: string): unknown {
  const require = globalThis.process.getBuiltinModule("node:module")
    .createRequire(resolve(dirname(path), "wanex-desktop-native-loader.cjs"))
  return require(path)
}

function isPathInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === "" || (
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  )
}

function requireClosedRecord(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("desktop credential artifact manifest is invalid")
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !(key in record))
  ) {
    throw new Error("desktop credential artifact manifest is invalid")
  }
  return record
}
