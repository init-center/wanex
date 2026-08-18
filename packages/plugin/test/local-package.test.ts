import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  inspectLocalPluginPackage,
  installLocalPluginPackage,
  materializeLocalPluginPackage,
  PluginRuntime,
  type PluginPackageLayout,
  type PluginPackageRuntimeDependency
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []

afterEach(async () => {
  while (stores.length > 0) {
    await stores.pop()?.dispose()
  }
  await Promise.all(tempDirs.splice(0).map(removeTestTree))
})

describe("local plugin packages", () => {
  it("inspects an unsigned package without executing or mutating it", async () => {
    const fixture = await createPackage()
    const before = await listTree(fixture.root)

    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })

    expect(inspection).toMatchObject({
      kind: "wanex.plugin.local-package.inspection",
      manifestFile: "wanex.plugin.json",
      fileCount: 2,
      review: {
        sourceKind: "local",
        signatureStatus: "unsigned",
        decision: "review-required"
      }
    })
    expect(inspection.artifactSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(inspection.files.map((file) => file.path)).toEqual([
      "README.md",
      "bin/plugin-host.mjs"
    ])
    expect(await listTree(fixture.root)).toEqual(before)
    await expect(readFile(join(fixture.root, "executed"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("rejects missing, malformed, and oversized manifests", async () => {
    const missing = await tempDir("wanex-plugin-missing-")
    await expect(
      inspectLocalPluginPackage({ sourceDir: missing })
    ).rejects.toMatchObject({ code: "ENOENT" })

    const malformed = await tempDir("wanex-plugin-malformed-")
    await writeFile(join(malformed, "wanex.plugin.json"), "{")
    await expect(
      inspectLocalPluginPackage({ sourceDir: malformed })
    ).rejects.toThrow(/valid JSON/)

    const oversized = await createPackage()
    await expect(
      inspectLocalPluginPackage({
        sourceDir: oversized.root,
        limits: { maxManifestBytes: 8 }
      })
    ).rejects.toThrow(/manifest exceeds 8 bytes/)
  })

  it("requires an exact file closure and matching hashes and sizes", async () => {
    const extra = await createPackage()
    await writeFile(join(extra.root, "extra.txt"), "extra")
    await expect(
      inspectLocalPluginPackage({ sourceDir: extra.root })
    ).rejects.toThrow(/file closure mismatch.*extra.txt/)

    const mutated = await createPackage()
    await writeFile(join(mutated.root, "README.md"), "changed")
    await expect(
      inspectLocalPluginPackage({ sourceDir: mutated.root })
    ).rejects.toThrow(/byte count mismatch|sha256 mismatch/)

    const missing = await createPackage()
    await rm(join(missing.root, "README.md"))
    await expect(
      inspectLocalPluginPackage({ sourceDir: missing.root })
    ).rejects.toThrow(/file closure mismatch.*README.md/)
  })

  it("rejects duplicate and unsafe manifest paths", async () => {
    const duplicate = await createPackage()
    await duplicate.writeLayout({
      ...duplicate.layout,
      files: [duplicate.layout.files![0]!, duplicate.layout.files![0]!]
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: duplicate.root })
    ).rejects.toThrow(/duplicate plugin package file/)

    for (const unsafePath of [
      "../escape",
      "bin\\escape",
      "bin//escape",
      "bin/plugin-host.mjs:stream"
    ]) {
      const fixture = await createPackage()
      await fixture.writeLayout({
        ...fixture.layout,
        files: [{ ...fixture.layout.files![0]!, path: unsafePath }]
      })
      await expect(
        inspectLocalPluginPackage({ sourceDir: fixture.root })
      ).rejects.toThrow(/path|root|segments/)
    }
  })

  it("rejects duplicate actions and runtime dependency names", async () => {
    const duplicateAction = await createPackage()
    const action = duplicateAction.layout.entry.actions[0]!
    await duplicateAction.writeLayout({
      ...duplicateAction.layout,
      entry: {
        ...duplicateAction.layout.entry,
        actions: [action, action]
      }
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: duplicateAction.root })
    ).rejects.toThrow(/duplicate plugin package action/)

    const dependency = {
      name: "demo",
      loading: "lazy" as const,
      distribution: "bundled" as const,
      maxPackedBytes: 1_024
    }
    const duplicateDependency = await createPackage()
    await duplicateDependency.writeLayout({
      ...duplicateDependency.layout,
      runtimeDependencies: [dependency, dependency]
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: duplicateDependency.root })
    ).rejects.toThrow(/duplicate plugin package runtime dependency/)
  })

  it("rejects symbolic links and executable declaration drift", async () => {
    const linked = await createPackage()
    await rm(join(linked.root, "README.md"))
    await symlink(join(linked.root, "bin/plugin-host.mjs"), join(linked.root, "README.md"))
    await expect(
      inspectLocalPluginPackage({ sourceDir: linked.root })
    ).rejects.toThrow(/symbolic link/)

    if (process.platform !== "win32") {
      const modeDrift = await createPackage()
      await chmod(join(modeDrift.root, "bin/plugin-host.mjs"), 0o644)
      await expect(
        inspectLocalPluginPackage({ sourceDir: modeDrift.root })
      ).rejects.toThrow(/executable mismatch/)
    }

    const undeclared = await createPackage()
    await undeclared.writeLayout({
      ...undeclared.layout,
      files: (undeclared.layout.files ?? []).map((file) => ({
        ...file,
        ...(file.path === "bin/plugin-host.mjs" ? { executable: false } : {})
      }))
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: undeclared.root })
    ).rejects.toThrow(/entry command must be executable|executable mismatch/)
  })

  it("enforces file count, single-file, total-byte, path-byte, and depth limits", async () => {
    const fixture = await createPackage()
    await expect(
      inspectLocalPluginPackage({ sourceDir: fixture.root, limits: { maxFiles: 1 } })
    ).rejects.toThrow(/exceeds 1 files/)
    await expect(
      inspectLocalPluginPackage({ sourceDir: fixture.root, limits: { maxFileBytes: 4 } })
    ).rejects.toThrow(/file exceeds 4 bytes/)
    await expect(
      inspectLocalPluginPackage({ sourceDir: fixture.root, limits: { maxTotalBytes: 16 } })
    ).rejects.toThrow(/total bytes/)
    await expect(
      inspectLocalPluginPackage({ sourceDir: fixture.root, limits: { maxPathBytes: 8 } })
    ).rejects.toThrow(/path exceeds 8 bytes/)
    await expect(
      inspectLocalPluginPackage({ sourceDir: fixture.root, limits: { maxPathDepth: 1 } })
    ).rejects.toThrow(/path exceeds depth 1/)
  })

  it("accounts for explicitly bundled dependencies and rejects hidden closure", async () => {
    const bundled = await createPackage({
      extraFiles: { "node_modules/demo/index.js": "export const demo = true\n" },
      runtimeDependencies: [{
        name: "demo",
        loading: "lazy",
        distribution: "bundled",
        maxPackedBytes: 1_024
      }]
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: bundled.root })
    ).resolves.toMatchObject({
      dependencies: [{
        name: "demo",
        distribution: "bundled",
        present: true,
        observedBytes: expect.any(Number)
      }]
    })

    const overBudget = await createPackage({
      extraFiles: { "node_modules/demo/index.js": "too large" },
      runtimeDependencies: [{
        name: "demo",
        loading: "lazy",
        distribution: "bundled",
        maxPackedBytes: 1
      }]
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: overBudget.root })
    ).rejects.toThrow(/exceeds maxPackedBytes/)

    const hidden = await createPackage({
      extraFiles: { "node_modules/demo/index.js": "hidden" }
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: hidden.root })
    ).rejects.toThrow(/undeclared bundled dependency/)

    const peerBundled = await createPackage({
      extraFiles: { "node_modules/demo/index.js": "peer" },
      runtimeDependencies: [{
        name: "demo",
        loading: "startup",
        distribution: "peer"
      }]
    })
    await expect(
      inspectLocalPluginPackage({ sourceDir: peerBundled.root })
    ).rejects.toThrow(/undeclared bundled dependency|must not be bundled/)
  })

  it("rejects stale review evidence before writing the install root", async () => {
    const fixture = await createPackage()
    const reviewed = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    await fixture.replaceFile("README.md", "review changed\n")
    const installBaseDir = await tempDir("wanex-plugin-installs-")

    await expect(
      materializeLocalPluginPackage({
        sourceDir: fixture.root,
        installBaseDir,
        expectedArtifactSha256: reviewed.artifactSha256
      })
    ).rejects.toThrow(/inspection is stale/)
    expect(await readdir(installBaseDir)).toEqual([])
  })

  it("rejects a package source contained by its install base", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })

    await expect(
      materializeLocalPluginPackage({
        sourceDir: fixture.root,
        installBaseDir: fixture.root,
        expectedArtifactSha256: inspection.artifactSha256
      })
    ).rejects.toThrow(/source must be outside installBaseDir/)
  })

  it("materializes one immutable content-addressed root and reuses it idempotently", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const request = {
      sourceDir: fixture.root,
      installBaseDir,
      expectedArtifactSha256: inspection.artifactSha256
    }

    const first = await materializeLocalPluginPackage(request)
    const second = await materializeLocalPluginPackage(request)

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(second.installRootDir).toBe(first.installRootDir)
    expect(first.installRootDir).toContain(inspection.artifactSha256)
    expect(first.installed.artifactSha256).toBe(inspection.artifactSha256)
    if (process.platform !== "win32") {
      expect((await stat(join(first.installRootDir, "README.md"))).mode & 0o222).toBe(0)
      expect((await stat(join(first.installRootDir, "bin/plugin-host.mjs"))).mode & 0o111)
        .not.toBe(0)
    }
    expect(await readdir(join(installBaseDir, ".staging"))).toEqual([])
  })

  it("fails closed on an occupied immutable target and cleans staging", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const finalRoot = join(
      installBaseDir,
      fixture.layout.pluginId,
      fixture.layout.version,
      inspection.artifactSha256
    )
    await mkdir(finalRoot, { recursive: true })
    await writeFile(join(finalRoot, "wanex.plugin.json"), "{}")

    await expect(
      materializeLocalPluginPackage({
        sourceDir: fixture.root,
        installBaseDir,
        expectedArtifactSha256: inspection.artifactSha256
      })
    ).rejects.toThrow()
    expect(await readdir(join(installBaseDir, ".staging"))).toEqual([])
  })

  it("persists explicit unsigned approval without inventing a signature", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const { runtime, storage } = await createRuntime()

    const installed = await installLocalPluginPackage({
      runtime,
      sourceDir: fixture.root,
      installBaseDir,
      expectedArtifactSha256: inspection.artifactSha256,
      approval: {
        status: "allow",
        actorId: "principal_plugin_admin",
        reason: "Reviewed local package"
      },
      now: () => 1234
    })

    expect(installed).toMatchObject({
      manifest: { pluginId: "plugin.local-fixture", state: "registered" },
      install: { state: "installed", installRootDir: installed.materialized.installRootDir }
    })
    const trust = installed.install.trust as Record<string, unknown>
    expect(trust.signature).toBeUndefined()
    expect(trust).toMatchObject({
      integrity: { sha256: inspection.artifactSha256 },
      decision: { status: "allow", reason: "Reviewed local package" },
      metadata: {
        localPackage: {
          approvedBy: "principal_plugin_admin",
          approvedAt: 1234,
          totalBytes: inspection.totalBytes,
          fileCount: inspection.fileCount
        }
      }
    })
    await expect(
      storage.getPluginManifest({
        pluginId: fixture.layout.pluginId,
        version: fixture.layout.version
      })
    ).resolves.toMatchObject({ id: installed.manifest.id })
  })

  it("rejects an empty local approval actor before materialization", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const { runtime } = await createRuntime()

    await expect(
      installLocalPluginPackage({
        runtime,
        sourceDir: fixture.root,
        installBaseDir,
        expectedArtifactSha256: inspection.artifactSha256,
        approval: { status: "allow", actorId: "   " }
      })
    ).rejects.toThrow(/approval actorId must not be empty/)
    expect(await readdir(installBaseDir)).toEqual([])
  })

  it("rejects same identity with different content without replacing the active install", async () => {
    const first = await createPackage()
    const second = await createPackage()
    await second.replaceFile("README.md", "different immutable content\n")
    const firstInspection = await inspectLocalPluginPackage({ sourceDir: first.root })
    const secondInspection = await inspectLocalPluginPackage({ sourceDir: second.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const { runtime, storage } = await createRuntime()

    const active = await installLocalPluginPackage({
      runtime,
      sourceDir: first.root,
      installBaseDir,
      expectedArtifactSha256: firstInspection.artifactSha256,
      approval: { status: "allow", actorId: "principal_admin" }
    })
    await expect(
      installLocalPluginPackage({
        runtime,
        sourceDir: second.root,
        installBaseDir,
        expectedArtifactSha256: secondInspection.artifactSha256,
        approval: { status: "allow", actorId: "principal_admin" }
      })
    ).rejects.toThrow(/already exists with different content/)
    await expect(
      storage.getPluginInstall({
        pluginId: first.layout.pluginId,
        version: first.layout.version
      })
    ).resolves.toMatchObject({ installRootDir: active.install.installRootDir })
  })

  it("rolls back a newly inserted manifest when atomic install activation conflicts", async () => {
    const fixture = await createPackage()
    const inspection = await inspectLocalPluginPackage({ sourceDir: fixture.root })
    const installBaseDir = await tempDir("wanex-plugin-installs-")
    const { runtime, storage } = await createRuntime()
    const active = await installLocalPluginPackage({
      runtime,
      sourceDir: fixture.root,
      installBaseDir,
      expectedArtifactSha256: inspection.artifactSha256,
      approval: { status: "allow", actorId: "principal_admin" }
    })

    await expect(
      storage.activatePluginInstall({
        manifest: {
          pluginId: "plugin.rollback-proof",
          version: "1.0.0",
          ...(active.manifest.entry === undefined
            ? {}
            : { entry: active.manifest.entry }),
          capabilities: active.manifest.capabilities,
          idempotencyKey: "plugin-rollback-proof-manifest"
        },
        install: {
          pluginId: "plugin.rollback-proof",
          version: "1.0.0",
          layout: active.install.layout,
          trust: active.install.trust,
          installRootDir: active.install.installRootDir,
          idempotencyKey: `plugin-install:${fixture.layout.pluginId}:${fixture.layout.version}`
        }
      })
    ).rejects.toThrow(/already exists with different content/)
    await expect(
      storage.getPluginManifest({
        pluginId: "plugin.rollback-proof",
        version: "1.0.0"
      })
    ).resolves.toBeNull()
  })
})

interface PackageFixture {
  readonly root: string
  layout: PluginPackageLayout
  writeLayout(layout: PluginPackageLayout): Promise<void>
  replaceFile(path: string, value: string): Promise<void>
}

async function createPackage(options: {
  readonly extraFiles?: Readonly<Record<string, string>>
  readonly runtimeDependencies?: readonly PluginPackageRuntimeDependency[]
} = {}): Promise<PackageFixture> {
  const root = await tempDir("wanex-local-plugin-")
  const files: Record<string, { value: string; executable: boolean }> = {
    "bin/plugin-host.mjs": {
      value: [
        "#!/usr/bin/env node",
        "await import('node:fs/promises').then(() => undefined)",
        ""
      ].join("\n"),
      executable: true
    },
    "README.md": { value: "Local plugin fixture\n", executable: false },
    ...Object.fromEntries(
      Object.entries(options.extraFiles ?? {}).map(([path, value]) => [
        path,
        { value, executable: false }
      ])
    )
  }
  for (const [path, file] of Object.entries(files)) {
    await writePackageFile(root, path, file.value, file.executable)
  }
  let layout = packageLayout(files, options.runtimeDependencies)
  const fixture: PackageFixture = {
    root,
    get layout() {
      return layout
    },
    set layout(value) {
      layout = value
    },
    async writeLayout(value) {
      layout = value
      await writeFile(
        join(root, "wanex.plugin.json"),
        `${JSON.stringify(value, null, 2)}\n`
      )
    },
    async replaceFile(path, value) {
      const current = files[path]
      if (current === undefined) {
        throw new Error(`unknown fixture file: ${path}`)
      }
      files[path] = { ...current, value }
      await writePackageFile(root, path, value, current.executable)
      await fixture.writeLayout(packageLayout(files, options.runtimeDependencies))
    }
  }
  await fixture.writeLayout(layout)
  return fixture
}

function packageLayout(
  files: Readonly<Record<string, { readonly value: string; readonly executable: boolean }>>,
  runtimeDependencies: readonly PluginPackageRuntimeDependency[] | undefined
): PluginPackageLayout {
  return {
    kind: "wanex.plugin.package.layout.v1",
    pluginId: "plugin.local-fixture",
    version: "1.0.0",
    name: "Local Fixture",
    entry: {
      kind: "wanex.plugin.host.subprocess.v1",
      command: "bin/plugin-host.mjs",
      actions: [{ actionId: "echo", capability: "config.read" }]
    },
    capabilities: ["config.read"],
    ...(runtimeDependencies === undefined ? {} : { runtimeDependencies }),
    files: Object.entries(files)
      .map(([path, file]) => ({
        path,
        bytes: Buffer.byteLength(file.value),
        sha256: digest(file.value),
        ...(file.executable ? { executable: true } : {})
      }))
      .sort((left, right) => compareText(left.path, right.path))
  }
}

async function writePackageFile(
  root: string,
  path: string,
  value: string,
  executable: boolean
): Promise<void> {
  const absolute = join(root, path)
  await mkdir(join(absolute, ".."), { recursive: true })
  await writeFile(absolute, value)
  if (process.platform !== "win32") {
    await chmod(absolute, executable ? 0o755 : 0o644)
  }
}

async function createRuntime(): Promise<{
  readonly runtime: PluginRuntime
  readonly storage: StorageTestStore
}> {
  const storeDir = await tempDir("wanex-plugin-store-")
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(storage)
  return { runtime: new PluginRuntime({ storage }), storage }
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function listTree(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { recursive: true })
  return entries.map(String).sort()
}

async function removeTestTree(root: string): Promise<void> {
  try {
    await makeWritable(root)
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error
    }
  }
  await rm(root, { recursive: true, force: true })
}

async function makeWritable(path: string): Promise<void> {
  const value = await stat(path)
  if (!value.isDirectory()) {
    if (process.platform !== "win32") {
      await chmod(path, 0o644)
    }
    return
  }
  if (process.platform !== "win32") {
    await chmod(path, 0o755)
  }
  const entries = await readdir(path, { withFileTypes: true })
  await Promise.all(entries.map((entry) => makeWritable(join(path, entry.name))))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
