import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createShell,
  createSurfaceAdapter,
  type PluginManagementEventListener,
  type PluginManagementMutationResult,
  type PluginManagementPort,
  type PluginManagementSnapshot,
  type RequestLocalPluginReviewResult,
} from "@wanex/product";
import type { SurfaceTransportRequest } from "@wanex/product/surface";
import { createHostSurfaceClient } from "../src/application/host.js";
import { createSurface } from "../src/application/surface.js";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Web Plugin management projection", () => {
  it("rereads canonical management only after its revision invalidates", async () => {
    const port = new FakePluginManagementPort();
    await withSurface(port, async ({ surface, observed }) => {
      const readCount = () => observed.filter(
        (request) =>
          request.operation === "dispatchSurfaceCommand" &&
          request.command.command === "readPluginManagement",
      ).length;
      const initialReads = readCount();

      expect(surface.snapshot().view.settings.plugins).toMatchObject({
        state: "ready",
        revision: port.snapshot.revision,
        installs: [{ pluginId: "plugin.example" }],
      });

      await surface.reconcileEvents();
      expect(readCount()).toBe(initialReads);

      port.emit(`plugin-management:sha256:${"b".repeat(64)}`, 8_000);
      const reconciled = await surface.reconcileEvents();
      expect(readCount()).toBe(initialReads + 1);
      expect(reconciled.pluginManagement).toMatchObject({
        ok: true,
        value: { kind: "plugin.management.snapshot" },
      });

      await surface.reconcileEvents();
      expect(readCount()).toBe(initialReads + 1);
    });
  });

  it("returns a one-shot review only in the typed action output", async () => {
    const port = new FakePluginManagementPort();
    await withSurface(port, async ({ surface }) => {
      const result = await surface.dispatchAction({
        type: "request-local-plugin-review",
      });

      expect(result).toMatchObject({
        ok: true,
        output: {
          kind: "web.plugin-management-action",
          action: "request-local-plugin-review",
          result: {
            kind: "plugin.management.review-ready",
            review: { reviewId: "review_plugin_example" },
          },
        },
      });
      expect(JSON.stringify(result.snapshot)).not.toContain(
        "review_plugin_example",
      );
      expect(JSON.stringify(result.snapshot)).not.toContain("sourceDir");
      expect(JSON.stringify(result.snapshot)).not.toContain("installBaseDir");
    });
  });

  it("projects a management domain rejection as a blocked action", async () => {
    const port = new FakePluginManagementPort();
    port.requestReviewResult = {
      kind: "plugin.management.rejected",
      reason: "selection_failed",
      message: "Native selection failed",
    };
    await withSurface(port, async ({ surface }) => {
      const result = await surface.dispatchAction({
        type: "request-local-plugin-review",
      });
      expect(result).toMatchObject({
        ok: false,
        message: "Native selection failed",
        output: {
          result: {
            kind: "plugin.management.rejected",
            reason: "selection_failed",
          },
        },
        snapshot: {
          operationStatus: {
            state: "blocked",
            message: "Native selection failed",
          },
        },
      });
    });
  });

  it("projects an unconfigured host without inventing an empty configured list", async () => {
    const storeDir = await createStoreDir();
    const shell = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
    });
    const productSurface = createSurfaceAdapter(shell);
    try {
      const surface = await createSurface({
        client: createHostSurfaceClient({ surface: productSurface }),
      });
      expect(surface.snapshot().view.settings.plugins).toEqual({
        state: "unavailable",
        installs: [],
        message: "Plugin management is not configured.",
      });
    } finally {
      await productSurface.dispose();
      await shell.dispose();
    }
  });
});

async function withSurface(
  port: PluginManagementPort,
  run: (context: {
    readonly surface: Awaited<ReturnType<typeof createSurface>>;
    readonly observed: SurfaceTransportRequest[];
  }) => Promise<void>,
): Promise<void> {
  const storeDir = await createStoreDir();
  const shell = await createShell({
    storage: { kind: "local-system-service", storeDir },
    artifacts: { explicitPath: serviceBin },
    pluginManagement: port,
  });
  const productSurface = createSurfaceAdapter(shell, { now: () => 7_000 });
  const observed: SurfaceTransportRequest[] = [];
  try {
    const surface = await createSurface({
      client: createHostSurfaceClient({
        surface: productSurface,
        observeRequest(request) {
          observed.push(request);
        },
      }),
      now: () => 7_001,
    });
    await run({ surface, observed });
  } finally {
    await productSurface.dispose();
    await shell.dispose();
  }
}

class FakePluginManagementPort implements PluginManagementPort {
  readonly snapshot: PluginManagementSnapshot = {
    kind: "plugin.management.snapshot",
    revision: `plugin-management:sha256:${"a".repeat(64)}`,
    installs: [{
      pluginId: "plugin.example",
      displayName: "Example Plugin",
      version: "1.0.0",
      state: "installed",
      runtimeState: "loaded",
      capabilities: ["config.read"],
      sourceKind: "local",
      signatureStatus: "unsigned",
      artifactSha256: "e".repeat(64),
      totalBytes: 1_024,
      fileCount: 3,
      commandCount: 1,
      updatedAt: 6_000,
    }],
  };
  private readonly listeners = new Set<PluginManagementEventListener>();
  requestReviewResult: RequestLocalPluginReviewResult | undefined;

  async read(): Promise<PluginManagementSnapshot> {
    return this.snapshot;
  }

  async requestLocalReview(): Promise<RequestLocalPluginReviewResult> {
    return this.requestReviewResult ?? {
      kind: "plugin.management.review-ready",
      review: {
        kind: "plugin.management.local-review",
        reviewId: "review_plugin_example",
        expiresAt: 60_000,
        pluginId: "plugin.example",
        displayName: "Example Plugin",
        version: "1.0.0",
        sourceKind: "local",
        signatureStatus: "unsigned",
        artifactSha256: "e".repeat(64),
        totalBytes: 1_024,
        fileCount: 3,
        capabilities: ["config.read"],
        commands: [{ id: "plugin.example.echo", title: "Echo" }],
        dependencies: [{
          name: "host-api",
          distribution: "peer",
          loading: "startup",
          observedBytes: 0,
        }],
      },
    };
  }

  async approveLocalReview(): Promise<PluginManagementMutationResult> {
    return applied("install", this.snapshot);
  }

  async cancelLocalReview() {
    return { kind: "plugin.management.review-cancelled" as const };
  }

  async setInstallState(): Promise<PluginManagementMutationResult> {
    return applied("set_state", this.snapshot);
  }

  async retryRefresh(): Promise<PluginManagementMutationResult> {
    return applied("retry_refresh", this.snapshot);
  }

  subscribe(listener: PluginManagementEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(revision: string, at: number): void {
    for (const listener of this.listeners) {
      listener({
        kind: "plugin.management.invalidated",
        sequence: 1,
        at,
        revision,
      });
    }
  }
}

function applied(
  operation: "install" | "set_state" | "retry_refresh",
  snapshot: PluginManagementSnapshot,
): PluginManagementMutationResult {
  return {
    kind: "plugin.management.applied",
    operation,
    snapshot,
    catalogRevision: "plugin-catalog:sha256:empty",
  };
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-web-plugin-management-"));
  tempDirs.push(dir);
  return dir;
}
