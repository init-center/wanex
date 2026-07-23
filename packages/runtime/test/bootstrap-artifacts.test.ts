import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  parseRuntimeArtifactManifest,
  resolveSystemServiceBinary,
  RuntimeArtifactResolutionError,
  systemServiceBinaryCandidates,
  type RuntimeArtifactManifest,
  type RuntimeArtifactTarget
} from "../src/bootstrap/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("@wanex/runtime/bootstrap artifact resolution", () => {
  it("parses only the one closed current manifest contract", () => {
    const manifest = manifestWith(target({
      platform: "darwin",
      arch: "arm64",
      path: "darwin-arm64/wanex-system-service"
    }))
    expect(parseRuntimeArtifactManifest(JSON.parse(JSON.stringify(manifest))))
      .toEqual(manifest)
    expect(() => parseRuntimeArtifactManifest({ ...manifest, schemaVersion: 2 }))
      .toThrow("closed object")
    expect(() => parseRuntimeArtifactManifest({
      ...manifest,
      targets: [{ ...manifest.targets[0], extra: true }]
    })).toThrow("closed object")
    expect(() => parseRuntimeArtifactManifest(null)).toThrow("closed object")
  })
  it("keeps trusted development override candidates ahead of the manifest", () => {
    const manifest = manifestWith(target({
      platform: "darwin",
      arch: "arm64",
      path: "darwin-arm64/wanex-system-service"
    }))
    expect(systemServiceBinaryCandidates({
      explicitPath: "/explicit/wanex-system-service",
      env: { WANEX_SYSTEM_SERVICE_BIN: "/env/wanex-system-service" },
      manifest,
      artifactDir: "/packaged",
      platform: "darwin",
      arch: "arm64"
    })).toEqual([
      { source: "explicit", path: "/explicit/wanex-system-service" },
      { source: "environment", path: "/env/wanex-system-service" },
      {
        source: "manifest",
        path: "/packaged/darwin-arm64/wanex-system-service"
      }
    ])
  })

  it("resolves and verifies the selected packaged target", async () => {
    const fixture = await createArtifact("darwin", "arm64", "native-binary")
    await expect(resolveSystemServiceBinary({
      manifest: fixture.manifest,
      artifactDir: fixture.root,
      platform: "darwin",
      arch: "arm64"
    })).resolves.toEqual({
      path: await realpath(fixture.path),
      source: "manifest",
      target: {
        id: "darwin-arm64",
        rustTarget: "aarch64-apple-darwin",
        platform: "darwin",
        arch: "arm64"
      },
      bytes: Buffer.byteLength("native-binary"),
      sha256: sha256("native-binary")
    })
  })

  it("selects a Windows .exe target without applying Unix execute bits", async () => {
    const fixture = await createArtifact("win32", "x64", "pe-binary")
    await expect(resolveSystemServiceBinary({
      manifest: fixture.manifest,
      artifactDir: fixture.root,
      platform: "win32",
      arch: "x64",
      checkExecutable: false
    })).resolves.toMatchObject({
      source: "manifest",
      target: {
        id: "win32-x64",
        rustTarget: "x86_64-pc-windows-msvc"
      }
    })
  })

  it("resolves the supported Linux x64 target", async () => {
    const fixture = await createArtifact("linux", "x64", "elf-binary")
    await expect(resolveSystemServiceBinary({
      manifest: fixture.manifest,
      artifactDir: fixture.root,
      platform: "linux",
      arch: "x64"
    })).resolves.toMatchObject({
      source: "manifest",
      target: {
        id: "linux-x64",
        rustTarget: "x86_64-unknown-linux-gnu",
        platform: "linux",
        arch: "x64"
      }
    })
  })

  it("fails closed for tampered size and checksum", async () => {
    const fixture = await createArtifact("darwin", "arm64", "original")
    await writeFile(fixture.path, "longer-tampered")
    await expect(resolvePackaged(fixture)).rejects.toMatchObject({
      code: "runtime_artifact_size_mismatch"
    })

    await writeFile(fixture.path, "different")
    const sameSize = manifestWith({
      ...fixture.manifest.targets[0]!,
      systemService: {
        ...fixture.manifest.targets[0]!.systemService,
        bytes: Buffer.byteLength("different")
      }
    })
    await expect(resolveSystemServiceBinary({
      manifest: sameSize,
      artifactDir: fixture.root,
      platform: "darwin",
      arch: "arm64"
    })).rejects.toMatchObject({
      code: "runtime_artifact_checksum_mismatch"
    })
  })

  it("rejects absent targets and invalid frozen target tuples", async () => {
    const fixture = await createArtifact("darwin", "arm64", "native")
    await expect(resolveSystemServiceBinary({
      manifest: fixture.manifest,
      artifactDir: fixture.root,
      platform: "darwin",
      arch: "x64"
    })).rejects.toMatchObject({ code: "runtime_artifact_target_missing" })

    const invalid = manifestWith({
      ...fixture.manifest.targets[0]!,
      rustTarget: "made-up-target"
    })
    await expect(resolveSystemServiceBinary({
      manifest: invalid,
      artifactDir: fixture.root,
      platform: "darwin",
      arch: "arm64"
    })).rejects.toMatchObject({ code: "runtime_artifact_manifest_invalid" })
  })

  it("rejects traversal, absolute paths, and platform filename mismatch", async () => {
    const root = await temporaryDir("wanex-artifact-path-")
    for (const path of ["../wanex-system-service", "/tmp/wanex-system-service"]) {
      await expect(resolveSystemServiceBinary({
        manifest: manifestWith(target({ platform: "darwin", arch: "arm64", path })),
        artifactDir: root,
        platform: "darwin",
        arch: "arm64"
      })).rejects.toMatchObject({ code: "runtime_artifact_path_escape" })
    }
    await expect(resolveSystemServiceBinary({
      manifest: manifestWith(target({
        platform: "win32",
        arch: "x64",
        path: "win32-x64/wanex-system-service"
      })),
      artifactDir: root,
      platform: "win32",
      arch: "x64",
      checkExecutable: false
    })).rejects.toMatchObject({ code: "runtime_artifact_manifest_invalid" })
  })

  it("rejects a symlink that escapes the packaged root", async () => {
    const root = await temporaryDir("wanex-artifact-root-")
    const outside = await temporaryDir("wanex-artifact-outside-")
    await mkdir(join(root, "darwin-arm64"), { recursive: true })
    const outsideBin = join(outside, "wanex-system-service")
    await writeFile(outsideBin, "outside")
    await chmod(outsideBin, 0o755)
    await symlink(outsideBin, join(root, "darwin-arm64/wanex-system-service"))
    await expect(resolveSystemServiceBinary({
      manifest: manifestWith(target({
        platform: "darwin",
        arch: "arm64",
        path: "darwin-arm64/wanex-system-service",
        content: "outside"
      })),
      artifactDir: root,
      platform: "darwin",
      arch: "arm64"
    })).rejects.toMatchObject({ code: "runtime_artifact_path_escape" })
  })

  it("requires manifest and artifactDir together", async () => {
    const manifest = manifestWith(target({
      platform: "darwin",
      arch: "arm64",
      path: "darwin-arm64/wanex-system-service"
    }))
    await expect(resolveSystemServiceBinary({ manifest })).rejects.toMatchObject({
      code: "runtime_artifact_manifest_root_missing"
    })
    await expect(resolveSystemServiceBinary({ artifactDir: "/packaged" }))
      .rejects.toMatchObject({ code: "runtime_artifact_manifest_root_missing" })
  })

  it("retains trusted explicit-path resolution and diagnostics", async () => {
    const root = await temporaryDir("wanex-explicit-artifact-")
    const path = join(root, "wanex-system-service")
    await writeFile(path, "#!/bin/sh\nexit 0\n")
    await chmod(path, 0o755)
    await expect(resolveSystemServiceBinary({ explicitPath: path })).resolves.toEqual({
      path,
      source: "explicit"
    })
    await expect(resolveSystemServiceBinary({ explicitPath: join(root, "missing") }))
      .rejects.toMatchObject({
        name: "RuntimeArtifactResolutionError",
        code: "runtime_artifact_not_executable"
      } satisfies Partial<RuntimeArtifactResolutionError>)
    await expect(resolveSystemServiceBinary()).rejects.toMatchObject({
      code: "runtime_artifact_missing_system_service",
      candidates: []
    })
  })
})

async function createArtifact(
  platform: "linux" | "darwin" | "win32",
  arch: "arm64" | "x64",
  content: string
) {
  const root = await temporaryDir("wanex-packaged-artifact-")
  const id = `${platform}-${arch}`
  const filename = platform === "win32"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  const path = join(root, id, filename)
  await mkdir(join(root, id), { recursive: true })
  await writeFile(path, content)
  if (platform !== "win32") await chmod(path, 0o755)
  return {
    root,
    path,
    manifest: manifestWith(target({
      platform,
      arch,
      path: `${id}/${filename}`,
      content
    }))
  }
}

function resolvePackaged(fixture: Awaited<ReturnType<typeof createArtifact>>) {
  return resolveSystemServiceBinary({
    manifest: fixture.manifest,
    artifactDir: fixture.root,
    platform: "darwin",
    arch: "arm64"
  })
}

function manifestWith(targetValue: RuntimeArtifactTarget): RuntimeArtifactManifest {
  return {
    kind: "wanex.runtime-artifacts",
    releaseVersion: "0.0.0",
    serviceVersion: "0.0.0",
    targets: [targetValue]
  }
}

function target(options: {
  readonly platform: "linux" | "darwin" | "win32"
  readonly arch: "arm64" | "x64"
  readonly path: string
  readonly content?: string
}): RuntimeArtifactTarget {
  const id = `${options.platform}-${options.arch}`
  const rustTarget = id === "linux-x64"
    ? "x86_64-unknown-linux-gnu"
    : id === "darwin-arm64"
      ? "aarch64-apple-darwin"
      : id === "darwin-x64"
        ? "x86_64-apple-darwin"
        : "x86_64-pc-windows-msvc"
  const content = options.content ?? "fixture"
  return {
    id,
    rustTarget,
    platform: options.platform,
    arch: options.arch,
    systemService: {
      kind: "executable",
      path: options.path,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content)
    }
  }
}

async function temporaryDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}
