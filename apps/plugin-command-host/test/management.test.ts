import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createTrustedSubprocessPluginActionHostFromInstall,
  type PluginPackageLayout,
} from "@wanex/plugin"
import { createStorageHandle, type StorageHandle } from "@wanex/storage"
import type { PluginManagementPort } from "@wanex/product/plugin-management"
import {
  createPluginCommandHost,
  type PluginCommandHost,
} from "../src/index.js"
import { projectInstalledPluginVersions } from "../src/management/projection.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)
const tempDirs: string[] = []
const handles: StorageHandle[] = []
const hosts: PluginCommandHost[] = []

afterEach(async () => {
  while (hosts.length > 0) await hosts.pop()?.dispose()
  while (handles.length > 0) await handles.pop()?.dispose()
  await Promise.all(tempDirs.splice(0).map(removeTestTree))
})

describe("Plugin command management", () => {
  it("projects malformed durable rows as bounded diagnostics", () => {
    const projected = projectInstalledPluginVersions(
      [{
        id: "install_invalid",
        pluginId: "plugin.invalid",
        version: "1.0.0",
        state: "installed",
        layout: { installRootDir: "/private/layout-leak" },
        trust: { sourceDir: "/private/trust-leak" },
        installRootDir: "/private/install-leak",
        installedAt: 1,
        updatedAt: 2,
      }],
      {
        kind: "plugin-command-host.status",
        started: false,
        disposed: false,
        activePluginCount: 0,
        commandCount: 0,
        executionHostCount: 0,
        catalogRevision: "plugin-catalog:sha256:empty",
        completedCount: 0,
        failedCount: 0,
        lastRefresh: {
          status: "failed",
          revision: "plugin-catalog:sha256:empty",
          activePluginCount: 0,
          commandCount: 0,
          diagnostic: { code: "layout_invalid", message: "layout_invalid" },
        },
      },
    )

    expect(projected).toEqual([{
      pluginId: "plugin.invalid",
      displayName: "plugin.invalid",
      version: "1.0.0",
      state: "installed",
      runtimeState: "attention_required",
      capabilities: [],
      sourceKind: "unknown",
      signatureStatus: "unknown",
      commandCount: 0,
      updatedAt: 2,
      diagnostic: {
        code: "record_invalid",
        message: "Plugin installation metadata is invalid.",
      },
    }])
    expect(JSON.stringify(projected)).not.toContain("/private/")
  })

  it("starts empty and bounds native selection outcomes", async () => {
    const selection = createSelection()
    const fixture = await createManagedHost({ selection })
    const management = requireManagement(fixture.host)
    expect(fixture.host.productBinding.pluginManagement).toBe(management)

    await expect(management.read()).resolves.toMatchObject({ installs: [] })
    await expect(management.requestLocalReview()).resolves.toEqual({
      kind: "plugin.management.review-cancelled",
    })

    selection.error = new Error("/private/source must not escape")
    const failed = await management.requestLocalReview()
    expect(failed).toEqual({
      kind: "plugin.management.rejected",
      reason: "selection_failed",
      message: "Local Plugin selection failed.",
    })
    expect(JSON.stringify(failed)).not.toContain("/private/source")
  })

  it("projects safe reviews and enforces capacity, cancellation, and expiry", async () => {
    const packageFixture = await createLocalPackage()
    const selection = createSelection(packageFixture.root)
    let now = 1_000
    const fixture = await createManagedHost({
      selection,
      now: () => now,
      reviewTtlMs: 1_000,
      maxPendingReviews: 1,
    })
    const management = requireManagement(fixture.host)

    const ready = await management.requestLocalReview()
    expect(ready).toMatchObject({
      kind: "plugin.management.review-ready",
      review: {
        pluginId: "plugin.management-fixture",
        displayName: "Management Fixture",
        version: "1.0.0",
        sourceKind: "local",
        signatureStatus: "unsigned",
        fileCount: 1,
        capabilities: ["config.read"],
        commands: [{ id: "plugin.management-fixture.echo", title: "Echo" }],
        dependencies: [{
          name: "host-api",
          distribution: "peer",
          loading: "startup",
          observedBytes: 0,
        }],
      },
    })
    const serialized = JSON.stringify(ready)
    expect(serialized).not.toContain(packageFixture.root)
    expect(serialized).not.toContain("plugin-host.mjs")
    expect(serialized).not.toContain("sourceDir")
    expect(serialized).not.toContain("files")
    expect(serialized).not.toContain("trust")
    if (ready.kind === "plugin.management.review-ready") {
      expect(Object.isFrozen(ready.review)).toBe(true)
      expect(Object.isFrozen(ready.review.commands)).toBe(true)
      expect(Object.isFrozen(ready.review.capabilities)).toBe(true)
    }

    await expect(management.requestLocalReview()).resolves.toMatchObject({
      reason: "review_capacity_reached",
    })
    if (ready.kind !== "plugin.management.review-ready") {
      throw new Error("expected review")
    }
    await expect(
      management.cancelLocalReview({ reviewId: ready.review.reviewId }),
    ).resolves.toEqual({
      kind: "plugin.management.review-cancelled",
    })
    await expect(
      management.cancelLocalReview({ reviewId: ready.review.reviewId }),
    ).resolves.toMatchObject({ reason: "review_not_found" })

    const expiring = await management.requestLocalReview()
    if (expiring.kind !== "plugin.management.review-ready") {
      throw new Error("expected expiring review")
    }
    now = expiring.review.expiresAt
    await expect(
      management.cancelLocalReview({ reviewId: expiring.review.reviewId }),
    ).resolves.toMatchObject({ reason: "review_expired" })
  })

  it("installs once under concurrent approval and publishes a safe catalog", async () => {
    const packageFixture = await createLocalPackage()
    const selection = createSelection(packageFixture.root)
    const fixture = await createManagedHost({ selection })
    const management = requireManagement(fixture.host)
    const events: string[] = []
    management.subscribe(() => {
      throw new Error("listener isolation")
    })
    management.subscribe((event) => events.push(event.revision))
    const review = await readyReview(management)

    const results = await Promise.all([
      management.approveLocalReview({
        reviewId: review.reviewId,
        reason: "Reviewed for this profile",
      }),
      management.approveLocalReview({ reviewId: review.reviewId }),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual([
      "plugin.management.applied",
      "plugin.management.rejected",
    ])
    expect(results).toContainEqual(
      expect.objectContaining({ reason: "review_not_found" }),
    )
    const applied = results.find(
      (result) => result.kind === "plugin.management.applied",
    )
    expect(applied).toMatchObject({
      operation: "install",
      snapshot: {
        installs: [{
          pluginId: "plugin.management-fixture",
          state: "installed",
          runtimeState: "loaded",
          sourceKind: "local",
          signatureStatus: "unsigned",
          totalBytes: expect.any(Number),
          fileCount: 1,
          commandCount: 1,
        }],
      },
    })
    expect(fixture.host.status()).toMatchObject({
      activePluginCount: 1,
      commandCount: 1,
    })
    expect(events).toHaveLength(1)
    expect(JSON.stringify(applied)).not.toContain(packageFixture.root)
    expect(JSON.stringify(applied)).not.toContain(fixture.installBaseDir)
  })

  it("consumes stale reviews without installing changed source", async () => {
    const packageFixture = await createLocalPackage()
    const selection = createSelection(packageFixture.root)
    const fixture = await createManagedHost({ selection })
    const management = requireManagement(fixture.host)
    const review = await readyReview(management)
    await packageFixture.replaceHost("#!/usr/bin/env node\nprocess.exitCode = 1\n")

    await expect(
      management.approveLocalReview({ reviewId: review.reviewId }),
    ).resolves.toMatchObject({ reason: "review_stale" })
    await expect(management.read()).resolves.toMatchObject({ installs: [] })
    await expect(
      management.approveLocalReview({ reviewId: review.reviewId }),
    ).resolves.toMatchObject({ reason: "review_not_found" })
  })

  it("uses exact state CAS and requires a new review after removal", async () => {
    const packageFixture = await createLocalPackage()
    const selection = createSelection(packageFixture.root)
    const fixture = await createManagedHost({ selection })
    const management = requireManagement(fixture.host)
    await management.approveLocalReview({
      reviewId: (await readyReview(management)).reviewId,
    })

    await expect(
      management.setInstallState({
        pluginId: packageFixture.pluginId,
        version: "1.0.0",
        expectedState: "installed",
        state: "disabled",
      }),
    ).resolves.toMatchObject({
      kind: "plugin.management.applied",
      snapshot: { installs: [{ state: "disabled", runtimeState: "inactive" }] },
    })
    await expect(
      management.setInstallState({
        pluginId: packageFixture.pluginId,
        version: "1.0.0",
        expectedState: "installed",
        state: "removed",
      }),
    ).resolves.toMatchObject({ reason: "state_conflict" })
    await expect(
      management.setInstallState({
        pluginId: packageFixture.pluginId,
        version: "1.0.0",
        expectedState: "disabled",
        state: "installed",
      }),
    ).resolves.toMatchObject({ kind: "plugin.management.applied" })
    await expect(
      management.setInstallState({
        pluginId: packageFixture.pluginId,
        version: "1.0.0",
        expectedState: "installed",
        state: "removed",
      }),
    ).resolves.toMatchObject({
      kind: "plugin.management.applied",
      snapshot: { installs: [{ state: "removed", runtimeState: "inactive" }] },
    })
    await expect(
      management.setInstallState({
        pluginId: packageFixture.pluginId,
        version: "1.0.0",
        expectedState: "removed",
        state: "installed",
      }),
    ).resolves.toMatchObject({ reason: "state_transition_invalid" })

    const restored = await management.approveLocalReview({
      reviewId: (await readyReview(management)).reviewId,
    })
    expect(restored).toMatchObject({
      kind: "plugin.management.applied",
      operation: "install",
      snapshot: { installs: [{ state: "installed", runtimeState: "loaded" }] },
    })
  })

  it("reports refresh attention, recovers by event, and disposes cleanly", async () => {
    const packageFixture = await createLocalPackage()
    const selection = createSelection(packageFixture.root)
    let failHostCreation = true
    const fixture = await createManagedHost({
      selection,
      createActionHost: async (request) => {
        if (failHostCreation) throw new Error(`/private/${request.install.pluginId}`)
        return createTrustedSubprocessPluginActionHostFromInstall(request)
      },
    })
    const management = requireManagement(fixture.host)
    const revisions: string[] = []
    management.subscribe((event) => revisions.push(event.revision))

    const attention = await management.approveLocalReview({
      reviewId: (await readyReview(management)).reviewId,
    })
    expect(attention).toMatchObject({
      kind: "plugin.management.attention-required",
      operation: "install",
      diagnostic: {
        code: "host_creation_failed",
        message: "Plugin command catalog refresh failed.",
      },
      snapshot: {
        installs: [{
          state: "installed",
          runtimeState: "attention_required",
          diagnostic: { code: "catalog_refresh_failed" },
        }],
      },
    })
    expect(JSON.stringify(attention)).not.toContain("/private/")
    expect(revisions).toHaveLength(1)

    failHostCreation = false
    await expect(management.retryRefresh()).resolves.toMatchObject({
      kind: "plugin.management.applied",
      operation: "retry_refresh",
      snapshot: { installs: [{ runtimeState: "loaded" }] },
    })
    expect(revisions).toHaveLength(2)
    await expect(management.retryRefresh()).resolves.toMatchObject({
      kind: "plugin.management.applied",
    })
    expect(revisions).toHaveLength(2)

    await fixture.host.dispose()
    await expect(management.read()).rejects.toThrow("disposed")
    await expect(management.retryRefresh()).resolves.toMatchObject({
      reason: "disposed",
    })
  })
})

interface Selection {
  path?: string
  error?: Error
  select(): string | undefined
}

function createSelection(path?: string): Selection {
  const selection: Selection = {
    select() {
      if (this.error !== undefined) throw this.error
      return this.path
    },
  }
  if (path !== undefined) selection.path = path
  return selection
}

async function createManagedHost(options: {
  readonly selection: Selection
  readonly now?: () => number
  readonly reviewTtlMs?: number
  readonly maxPendingReviews?: number
  readonly createActionHost?: NonNullable<
    Parameters<typeof createPluginCommandHost>[0]["createActionHost"]
  >
}): Promise<{
  readonly host: PluginCommandHost
  readonly installBaseDir: string
}> {
  const handle = await createHandle()
  const installBaseDir = await tempDir("wanex-plugin-management-installs-")
  const host = await createPluginCommandHost({
    handle,
    principalId: "principal_plugin_management",
    worker: {
      workerId: "worker_plugin_management",
      leaseMs: 60_000,
    },
    ...(options.createActionHost === undefined
      ? {}
      : { createActionHost: options.createActionHost }),
    management: {
      installBaseDir,
      actorId: "principal_plugin_management",
      selectLocalPackage: () => options.selection.select(),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.reviewTtlMs === undefined
        ? {}
        : { reviewTtlMs: options.reviewTtlMs }),
      ...(options.maxPendingReviews === undefined
        ? {}
        : { maxPendingReviews: options.maxPendingReviews }),
    },
  })
  hosts.push(host)
  return { host, installBaseDir }
}

function requireManagement(host: PluginCommandHost): PluginManagementPort {
  if (host.management === undefined) throw new Error("management is missing")
  return host.management
}

async function readyReview(management: PluginManagementPort) {
  const result = await management.requestLocalReview()
  if (result.kind !== "plugin.management.review-ready") {
    throw new Error(`review failed: ${result.kind}`)
  }
  return result.review
}

interface LocalPackageFixture {
  readonly root: string
  readonly pluginId: string
  replaceHost(source: string): Promise<void>
}

async function createLocalPackage(): Promise<LocalPackageFixture> {
  const root = await tempDir("wanex-plugin-management-source-")
  const pluginId = "plugin.management-fixture"
  const hostPath = "bin/plugin-host.mjs"
  let hostSource = "#!/usr/bin/env node\nprocess.exit(0)\n"
  const write = async (): Promise<void> => {
    const absoluteHost = join(root, hostPath)
    await mkdir(join(absoluteHost, ".."), { recursive: true })
    await writeFile(absoluteHost, hostSource)
    if (process.platform !== "win32") await chmod(absoluteHost, 0o755)
    const layout: PluginPackageLayout = {
      kind: "wanex.plugin.package.layout.v1",
      pluginId,
      version: "1.0.0",
      name: "Management Fixture",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command: hostPath,
        actions: [{ actionId: "echo", capability: "config.read" }],
      },
      capabilities: ["config.read"],
      contributes: {
        commands: [{
          id: "plugin.management-fixture.echo",
          name: "plugin.management-fixture.echo",
          title: "Echo",
          paletteVisibility: "visible",
          actionId: "echo",
        }],
      },
      runtimeDependencies: [{
        name: "host-api",
        distribution: "peer",
        loading: "startup",
      }],
      files: [{
        path: hostPath,
        bytes: Buffer.byteLength(hostSource),
        sha256: createHash("sha256").update(hostSource).digest("hex"),
        executable: true,
      }],
    }
    await writeFile(join(root, "wanex.plugin.json"), `${JSON.stringify(layout, null, 2)}\n`)
  }
  await write()
  return {
    root,
    pluginId,
    async replaceHost(source) {
      hostSource = source
      await write()
    },
  }
}

async function createHandle(): Promise<StorageHandle> {
  const storeDir = await tempDir("wanex-plugin-management-store-")
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin,
  })
  handles.push(handle)
  return handle
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function removeTestTree(root: string): Promise<void> {
  if (process.platform !== "win32") await makeWritable(root)
  await rm(root, { recursive: true, force: true })
}

async function makeWritable(root: string): Promise<void> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  await chmod(root, 0o755).catch(() => undefined)
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) await makeWritable(path)
    else await chmod(path, 0o644).catch(() => undefined)
  }
}
