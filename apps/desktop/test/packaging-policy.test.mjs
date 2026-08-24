import { createPackage } from "@electron/asar";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditPackagedProductDesktop,
  auditProductDesktopStaging,
  buildProductDesktop,
  normalizeAsarEntry,
  packageRoot,
  productDesktopResourcesDir,
  stageProductDesktopCredentialArtifact,
  stagingDir,
  workspaceRoot,
} from "../scripts/build.mjs";
import {
  PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT,
  summarizeProductDesktopSamples,
} from "../scripts/metrics.mjs";
import {
  assertRelaunchJourneyFixtureRequests,
  assertRelaunchJourneyRuntimeReceipt,
  assertCanonicalProofArgs,
  createProductDesktopProofProcessEnvironment,
  measureProductDesktopSample,
  removeProductDesktopProofRoot,
} from "../scripts/proof.mjs";
import {
  writeProductDesktopFailureReport,
} from "../scripts/proof/failure-report.mjs";
import {
  requiredWanexDesktopPackagedProofStep,
} from "../src/packaged-renderer-proof.ts";
import {
  electronArtifactChecksum,
  electronArtifactFileName,
  prepareElectronArtifact,
  sha256File,
  validateElectronArtifact,
} from "../scripts/electron-artifact.mjs";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(async (dir) => await rm(dir, { recursive: true, force: true })),
  );
});

describe("Product Desktop packaging policy", () => {
  it("builds one two-entry dependency-free application bundle", async () => {
    await expect(buildProductDesktop()).resolves.toEqual({
      kind: "wanex.product-desktop.staging-receipt",
      fileCount: 2,
      bytes: expect.any(Number),
      hasNodeModules: false,
    });
    const manifest = JSON.parse(
      await readFile(join(stagingDir, "package.json"), "utf8"),
    );
    expect(manifest.productName).toBe("Wanex");
    expect(manifest).not.toHaveProperty("dependencies");
    const main = await readFile(join(stagingDir, "main.cjs"), "utf8");
    expect(main).not.toMatch(/(?:\bfrom\s*|\bimport\s*\()\s*["']@wanex\//);
    expect(main).not.toContain(workspaceRoot);
    expect(main).not.toContain("sourceMappingURL");
    expect(main).not.toMatch(
      /(?:\bimport\s*\(|\brequire\s*\()\s*["']@wanex\/local-credential-store\/keychain["']/,
    );
    expect(main).toContain(
      "Product Desktop requires its verified injected credential binding",
    );
  });

  it("freezes the no-IPC exact-origin renderer policy", async () => {
    const main = await readFile(join(packageRoot, "src/main.ts"), "utf8");
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    expect(manifest.dependencies).toEqual({
      "@wanex/local-credential-store": "workspace:*",
      "@wanex/local-host": "workspace:*",
      "@wanex/plugin": "workspace:*",
      "@wanex/plugin-command-host": "workspace:*",
    });
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");
    expect(main).toContain('action: "deny"');
    expect(main).toContain('on("will-navigate"');
    expect(main).toContain("setPermissionRequestHandler");
    expect(main).toContain("setPermissionCheckHandler");
    expect(main).toContain("startLocalWebApp");
    expect(main).toContain("loadURL(product.url)");
    expect(main).not.toMatch(/\bipcMain\b|\bipcRenderer\b|\bcontextBridge\b/);
    expect(main).not.toContain("@wanex/runtime");
    expect(main).not.toContain("preload:");
    expect(main).not.toContain("loadFile(");
  });

  it("requires a prepared, checksum-verified Electron artifact", async () => {
    const fileName = electronArtifactFileName({
      version: "43.2.0",
      platform: "darwin",
      arch: "arm64",
    });
    expect(fileName).toBe("electron-v43.2.0-darwin-arm64.zip");
    expect(electronArtifactChecksum(fileName)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => electronArtifactChecksum("electron-v43.2.0-unknown.zip"))
      .toThrow("Electron checksum is missing");
    await expect(prepareElectronArtifact({
      platform: process.platform,
      arch: process.arch === "x64" ? "arm64" : "x64",
    })).rejects.toThrow("requires the host target");

    const root = await temporaryDirectory("wanex-electron-artifact-");
    const filePath = join(root, fileName);
    await writeFile(filePath, "verified-electron-artifact", "utf8");
    const checksum = await sha256File(filePath);
    await expect(validateElectronArtifact({
      filePath,
      root,
      expectedName: fileName,
      expectedChecksum: checksum,
    })).resolves.toMatchObject({
      path: expect.stringMatching(/electron-v43\.2\.0-darwin-arm64\.zip$/),
      bytes: 26,
      sha256: checksum,
    });
    await expect(validateElectronArtifact({
      filePath,
      root,
      expectedName: fileName,
      expectedChecksum: "0".repeat(64),
    })).rejects.toThrow("checksum mismatch");

    const outside = join(root, "..", fileName);
    await writeFile(outside, "outside", "utf8");
    await expect(validateElectronArtifact({
      filePath: outside,
      root,
      expectedName: fileName,
      expectedChecksum: await sha256File(outside),
    })).rejects.toThrow("outside its preparation directory");
    await rm(outside, { force: true });
  });

  it("does not let Desktop packaging guess from user Electron caches", async () => {
    const buildSource = await readFile(join(packageRoot, "scripts/build.mjs"), "utf8");
    expect(buildSource).toContain("resolvePreparedElectronZipPath");
    expect(buildSource).not.toContain("ELECTRON_CACHE");
    expect(buildSource).not.toContain("homedir()");
  });

  it("stages exactly one target keyring binding with integrity evidence", async () => {
    const root = await temporaryDirectory("wanex-product-desktop-keyring-");
    const binaryPath = join(root, "fixture.node");
    await writeFile(binaryPath, "fixture-keyring", "utf8");
    await expect(
      stageProductDesktopCredentialArtifact({
        platform: "darwin",
        arch: "arm64",
        binaryPath,
      }),
    ).resolves.toMatchObject({
      kind: "wanex.product-desktop.credential-staging-receipt",
      target: "darwin-arm64",
      fileCount: 2,
      bytes: 15,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects staging dependencies and unexpected files", async () => {
    await buildProductDesktop();
    const root = await copyToTemp(stagingDir, "wanex-product-desktop-stage-");
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.dependencies = { bad: "1.0.0" };
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await expect(auditProductDesktopStaging(root)).rejects.toThrow(
      "must not declare dependencies",
    );
    delete manifest.dependencies;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await writeFile(join(root, "preload.cjs"), "module.exports = {}\n", "utf8");
    await expect(auditProductDesktopStaging(root)).rejects.toThrow(
      "unexpected files",
    );
  });

  it("audits one ASAR and both exact external native resources", async () => {
    await buildProductDesktop();
    const root = await temporaryDirectory("wanex-product-desktop-package-");
    const stagedNativeDir = await createNativeFixture();
    const stagedCredentialDir = await createCredentialFixture();
    const resources = productDesktopResourcesDir(root);
    await mkdir(resources, { recursive: true });
    await createPackage(stagingDir, join(resources, "app.asar"));
    await Promise.all([
      cp(stagedNativeDir, join(resources, "native"), { recursive: true }),
      cp(stagedCredentialDir, join(resources, "credentials"), {
        recursive: true,
      }),
    ]);
    await expect(
      auditPackagedProductDesktop({
        packageDir: root,
        stagedNativeDir,
        stagedCredentialDir,
      }),
    ).resolves.toMatchObject({
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false,
      asarEntryCount: 2,
      nativeFileCount: 2,
      credentialFileCount: 2,
    });
    await writeFile(
      join(resources, "credentials", "keyring.node"),
      "tampered",
      "utf8",
    );
    await expect(
      auditPackagedProductDesktop({
        packageDir: root,
        stagedNativeDir,
        stagedCredentialDir,
      }),
    ).rejects.toThrow("credential resource differs");
  }, 15_000);

  it("normalizes platform-specific ASAR entry separators", () => {
    expect(normalizeAsarEntry("/main.cjs")).toBe("/main.cjs");
    expect(normalizeAsarEntry("\\main.cjs")).toBe("/main.cjs");
    expect(normalizeAsarEntry("package.json")).toBe("/package.json");
    expect(normalizeAsarEntry("../unexpected.js")).toBe("/../unexpected.js");
  });

  it("freezes one cold and four warm Product Desktop samples", () => {
    expect(PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT).toBe(5);
    expect(assertCanonicalProofArgs([])).toBeUndefined();
    expect(assertCanonicalProofArgs(["--"])).toBeUndefined();
    expect(() => assertCanonicalProofArgs(["--samples", "5"])).toThrow(
      "unknown Product Desktop proof argument",
    );
    expect(
      summarizeProductDesktopSamples([
        sample(0, "cold", 50, 500),
        sample(1, "warm", 10, 100),
        sample(2, "warm", 20, 200),
        sample(3, "warm", 30, 300),
        sample(4, "warm", 40, 400),
      ]),
    ).toMatchObject({
      cold: {
        sampleCount: 1,
        timingsMs: { artifactVerification: 50, wallTime: 500 },
      },
      warm: {
        sampleCount: 4,
        metrics: {
          artifactVerification: {
            medianMs: 25,
            maximumMs: 40,
            samplesMs: [10, 20, 30, 40],
          },
          wallTime: {
            medianMs: 250,
            maximumMs: 400,
            samplesMs: [100, 200, 300, 400],
          },
        },
      },
    });
  });

  it("keeps process inspection mandatory and outside wall time", async () => {
    let now = 0;
    let audited = false;
    await expect(
      measureProductDesktopSample(
        async () => {
          now = 25;
          return { stdout: "", stderr: "" };
        },
        async () => {
          audited = true;
          now = 250;
        },
        () => now,
      ),
    ).resolves.toEqual({
      output: { stdout: "", stderr: "" },
      wallTimeMs: 25,
    });
    expect(audited).toBe(true);

    await expect(
      measureProductDesktopSample(
        async () => ({ stdout: "", stderr: "" }),
        async () => {
          throw new Error("process inspection failed");
        },
      ),
    ).rejects.toThrow("process inspection failed");
  });

  it("removes inherited proof secrets from Provider relaunch processes", () => {
    const environment = createProductDesktopProofProcessEnvironment(
      {
        KEEP_ME: "retained",
        WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL: "inherited-secret",
        WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL: "http://127.0.0.1:1/v1",
        WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS: '["/inherited"]',
        WANEX_DESKTOP_PROOF_STEP: "relaunch-configure",
      },
      {
        WANEX_DESKTOP_PROOF_RECEIPT: "relaunch-chat.json",
        WANEX_DESKTOP_PROOF_STEP: "relaunch-chat",
      },
    );

    expect(environment).toEqual({
      KEEP_ME: "retained",
      WANEX_DESKTOP_PROOF_RECEIPT: "relaunch-chat.json",
      WANEX_DESKTOP_PROOF_STEP: "relaunch-chat",
    });
  });

  it("cleans only its owned proof root after immutable extension materialization", async () => {
    const root = await temporaryDirectory("wanex-product-desktop-cleanup-");
    const sealed = join(root, "extensions", "plugin", "1.0.0", "digest", "bin");
    const executable = join(sealed, "plugin-host");
    await mkdir(sealed, { recursive: true });
    await writeFile(executable, "fixture", "utf8");
    if (process.platform !== "win32") {
      await chmod(executable, 0o555);
      await chmod(sealed, 0o555);
    }

    await removeProductDesktopProofRoot(root);
    tempDirs.splice(tempDirs.indexOf(root), 1);
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("persists bounded failure evidence before the proof root is removed", async () => {
    const proofRoot = await temporaryDirectory("wanex-product-desktop-failure-");
    const outputRoot = await temporaryDirectory("wanex-product-desktop-report-");
    await writeFile(
      join(proofRoot, "runtime-receipt-0.json"),
      JSON.stringify({
        kind: "wanex.product-desktop.runtime-receipt",
        ok: false,
        failurePhase: "renderer_proof",
        failureProofStep: "lifecycle",
        failureDiagnostic: "renderer_provider_lifecycle",
        error: {
          name: "DesktopRendererProofError",
          code: "desktop_renderer_proof_failed",
          message: "runtime-secret",
        },
        renderer: {
          ok: false,
          failureStage: "provider_lifecycle",
          failureDiagnostics: {
            surfaceCount: 1,
            userRowCount: 2,
            assistantRowCount: 1,
            composerCount: 1,
            composerDisabled: true,
            modelSelectorCount: 1,
            modelSelectorDisabled: false,
            providerState: "ready",
            errorVisible: false,
            activeSessionCount: 1,
            activeSessionIdPresent: true,
            richHeadingVisible: true,
            richCodeVisible: true,
            selectedResponseVisible: true,
            sessionId: "renderer-session-secret",
          },
          providerConfigured: true,
          providerEditedWithoutCredential: true,
          configuredProviderCount: 2,
          activeProviderRemoved: false,
          fallbackProviderReady: false,
          fallbackModelResponseVisible: false,
          selectedModelEndpointId: "renderer-endpoint-secret",
        },
        secret: "receipt-secret",
      }),
      "utf8",
    );
    const error = Object.assign(new Error("outer-secret"), {
      code: "product_desktop_process_failed",
    });

    const report = await writeProductDesktopFailureReport({
      error,
      proofRoot,
      providerRequests: [
        {
          path: "/v1/selected/chat/completions",
          model: "provider-model-secret",
          authorized: true,
          messages: [{ content: "provider-message-secret" }],
          credential: "provider-credential-secret",
        },
        {
          path: "/v1/primary/chat/completions",
          model: "provider-fallback-secret",
          authorized: false,
        },
      ],
      outputRoot,
    });

    expect(report).toMatchObject({
      kind: "wanex.product-desktop.proof-receipt",
      ok: false,
      failure: {
        name: "Error",
        code: "product_desktop_process_failed",
      },
      runtimeFailures: [{
        failurePhase: "renderer_proof",
        failureProofStep: "lifecycle",
        failureDiagnostic: "renderer_provider_lifecycle",
        renderer: {
          ok: false,
          failureStage: "provider_lifecycle",
          failureDiagnostics: {
            surfaceCount: 1,
            userRowCount: 2,
            assistantRowCount: 1,
            composerCount: 1,
            composerDisabled: true,
            modelSelectorCount: 1,
            modelSelectorDisabled: false,
            providerState: "ready",
            errorVisible: false,
            activeSessionCount: 1,
            activeSessionIdPresent: true,
            richHeadingVisible: true,
            richCodeVisible: true,
            selectedResponseVisible: true,
          },
          providerConfigured: true,
          providerEditedWithoutCredential: true,
          configuredProviderCount: 2,
          activeProviderRemoved: false,
          fallbackProviderReady: false,
          fallbackModelResponseVisible: false,
        },
      }],
      providerFixture: {
        requestCount: 2,
        retainedCount: 2,
        truncated: false,
        requests: [
          { kind: "chat_completion", authorized: true },
          { kind: "chat_completion", authorized: false },
        ],
      },
    });
    const persisted = await readFile(
      join(outputRoot, "product-desktop-report.json"),
      "utf8",
    );
    expect(JSON.parse(persisted)).toEqual(report);
    expect(persisted).not.toMatch(
      /outer-secret|runtime-secret|renderer-secret|receipt-secret|provider-model-secret|provider-fallback-secret|provider-message-secret|provider-credential-secret/,
    );
    await removeProductDesktopProofRoot(proofRoot);
    tempDirs.splice(tempDirs.indexOf(proofRoot), 1);
    await expect(stat(proofRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(outputRoot, "product-desktop-report.json"), "utf8"),
    ).resolves.toBe(persisted);
  });

  it("bounds Provider fixture failure evidence without retaining request data", async () => {
    const proofRoot = await temporaryDirectory("wanex-provider-evidence-root-");
    const outputRoot = await temporaryDirectory("wanex-provider-evidence-report-");
    const providerRequests = Array.from({ length: 70 }, (_, index) => ({
      path: index % 2 === 0
        ? "/v1/chat/completions"
        : "/v1/images/generations",
      authorized: index !== 69,
      model: `secret-model-${index}`,
      body: { messages: [{ content: `secret-message-${index}` }] },
    }));

    const report = await writeProductDesktopFailureReport({
      error: new Error("bounded fixture evidence"),
      proofRoot,
      providerRequests,
      outputRoot,
    });

    expect(report.providerFixture).toMatchObject({
      requestCount: 70,
      retainedCount: 64,
      truncated: true,
    });
    expect(report.providerFixture.requests).toHaveLength(64);
    expect(report.providerFixture.requests[0]).toEqual({
      kind: "chat_completion",
      authorized: true,
    });
    expect(report.providerFixture.requests[1]).toEqual({
      kind: "image_generation",
      authorized: true,
    });
    const persisted = await readFile(
      join(outputRoot, "product-desktop-report.json"),
      "utf8",
    );
    expect(persisted).not.toMatch(/secret-model|secret-message|chat\/completions/);
  });

  it("rejects unknown Renderer failure stages from durable evidence", async () => {
    const proofRoot = await temporaryDirectory("wanex-renderer-stage-root-");
    const outputRoot = await temporaryDirectory("wanex-renderer-stage-report-");
    await writeFile(
      join(proofRoot, "runtime-receipt-0.json"),
      JSON.stringify({
        kind: "wanex.product-desktop.runtime-receipt",
        ok: false,
        failurePhase: "renderer_proof",
        error: { name: "Error", code: "desktop_renderer_proof_failed" },
        renderer: {
          ok: false,
          failureStage: "secret_untrusted_stage",
          providerConfigured: false,
        },
      }),
      "utf8",
    );

    const report = await writeProductDesktopFailureReport({
      error: new Error("renderer failed"),
      proofRoot,
      outputRoot,
    });

    expect(report.runtimeFailures[0]?.renderer?.failureStage).toBe(
      "unknown_stage",
    );
    expect(JSON.stringify(report)).not.toContain("secret_untrusted_stage");
  });

  it("accepts one exact post-relaunch Provider request only", () => {
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 0,
          imageMediaTypes: [],
          imageBytes: 0,
          schedulePhase: "held",
          scheduleAttempt: 1,
          scheduleReleaseReceived: true,
          scheduleSettled: true,
          scheduleClientClosed: false,
        }],
        "relaunch-schedule-create",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 0,
          imageMediaTypes: [],
          imageBytes: 0,
          schedulePhase: "restored",
          scheduleAttempt: 2,
        }],
        "relaunch-schedule-restore",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            schedulePhase: "held",
            scheduleAttempt: 1,
            scheduleReleaseReceived: true,
            scheduleSettled: true,
            scheduleClientClosed: false,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            schedulePhase: "restored",
            scheduleAttempt: 2,
          },
        ],
        "relaunch-schedule-create",
      ),
    ).toThrow("Schedule create Provider requests are invalid");
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            sideQueryPhase: "parent",
            sideQueryReleaseReceived: true,
            sideQueryParentSettled: true,
            sideQueryParentClientClosed: false,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            sideQueryPhase: "query",
            sideQueryParentActiveAtRequest: true,
            sideQueryParentContextPresent: true,
            toolDefinitionCount: 0,
          },
        ],
        "relaunch-side-query",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            guidedFollowUpPhase: "parent",
            guidedFollowUpReleaseReceived: true,
            guidedFollowUpSettled: true,
            guidedFollowUpClientClosed: false,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            guidedFollowUpPhase: "child",
            guidedFollowUpParentSettledBeforeRequest: true,
          },
        ],
        "relaunch-guided-follow-up",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            cancelRegeneratePhase: "held",
            cancelRegenerateAttempt: 1,
            cancelRegenerateClientClosed: true,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            cancelRegeneratePhase: "regenerated",
            cancelRegenerateAttempt: 2,
          },
        ],
        "relaunch-cancel-regenerate",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            goalPhase: "execution",
            goalAttempt: 1,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            goalPhase: "verifier",
            goalAttempt: 1,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            goalPhase: "execution",
            goalAttempt: 2,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 0,
            imageMediaTypes: [],
            imageBytes: 0,
            goalPhase: "verifier",
            goalAttempt: 2,
          },
        ],
        "relaunch-goal",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            planPhase: "generation",
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            planPhase: "execution",
          },
        ],
        "relaunch-plan",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 0,
          imageMediaTypes: [],
          imageBytes: 0,
        }],
        "relaunch-configure",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            imageGenerationPhase: "tool_call",
          },
          {
            path: "/v1/relaunch/images/generations",
            model: "desktop-proof-image-model",
            authorized: true,
            imageGenerationPhase: "media",
            generatedImageCount: 1,
            generatedImageMediaTypes: ["image/png"],
            generatedImageBytes: 68,
          },
          {
            path: "/v1/relaunch/chat/completions",
            model: "desktop-proof-relaunch-model",
            authorized: true,
            imageInputCount: 1,
            imageMediaTypes: ["image/png"],
            imageBytes: 68,
            imageGenerationPhase: "final",
          },
        ],
        "relaunch-image-generation",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 0,
          imageMediaTypes: [],
          imageBytes: 0,
        }],
        "relaunch-chat",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 1,
          imageMediaTypes: ["image/png"],
          imageBytes: 68,
          teamPhase: "round",
          teamInputImageCount: 0,
          teamInputImageBytes: 0,
        }],
        "relaunch-team",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 1,
          imageMediaTypes: ["image/png"],
          imageBytes: 68,
          teamPhase: "round",
          teamInputImageCount: 1,
          teamInputImageBytes: 68,
        }],
        "relaunch-team",
      ),
    ).toThrow("Team Provider requests are invalid");
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: true,
          imageInputCount: 1,
          imageMediaTypes: ["image/png"],
          imageBytes: 68,
        }],
        "relaunch-multimodal",
      ),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests([], "relaunch-cleanup"),
    ).not.toThrow();
    expect(() =>
      assertRelaunchJourneyFixtureRequests(
        [{
          path: "/v1/relaunch/chat/completions",
          model: "desktop-proof-relaunch-model",
          authorized: false,
          imageInputCount: 0,
          imageMediaTypes: [],
          imageBytes: 0,
        }],
        "relaunch-chat",
      ),
    ).toThrow("Provider requests are invalid");
  });

  it("accepts only the two canonical Schedule packaged proof steps", () => {
    expect(requiredWanexDesktopPackagedProofStep("relaunch-schedule-create"))
      .toBe("relaunch-schedule-create");
    expect(requiredWanexDesktopPackagedProofStep("relaunch-schedule-restore"))
      .toBe("relaunch-schedule-restore");
    expect(() => requiredWanexDesktopPackagedProofStep("schedule-create"))
      .toThrow("must be recognized");
  });

  it("accepts only exact Schedule create and restore runtime receipts", () => {
    const create = scheduleRuntimeReceipt("relaunch-schedule-create");
    const restore = scheduleRuntimeReceipt("relaunch-schedule-restore");
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      create,
      "relaunch-schedule-create",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      restore,
      "relaunch-schedule-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      {
        ...create,
        renderer: { ...create.renderer, scheduleId: "must-not-be-retained" },
      },
      "relaunch-schedule-create",
    )).toThrow("runtime proof failed");
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      {
        ...restore,
        renderer: { ...restore.renderer, disabledQuietWindowObserved: false },
      },
      "relaunch-schedule-restore",
    )).toThrow("runtime proof failed");
  });

  it("accepts only the bounded installed Team runtime receipt", () => {
    const runtime = teamRuntimeReceipt();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      runtime,
      "relaunch-team",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      {
        ...runtime,
        renderer: { ...runtime.renderer, sessionId: "must-not-be-retained" },
      },
      "relaunch-team",
    )).toThrow("runtime proof failed");
  });

  it("accepts only exact Plugin install and restore runtime receipts", () => {
    const install = pluginRuntimeReceipt("relaunch-plugin-install");
    const restore = pluginRuntimeReceipt("relaunch-plugin-restore");
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      install,
      "relaunch-plugin-install",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      restore,
      "relaunch-plugin-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      {
        ...install,
        renderer: { ...install.renderer, sourceDir: "/private/source" },
      },
      "relaunch-plugin-install",
    )).toThrow("runtime proof failed");
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      {
        ...restore,
        renderer: { ...restore.renderer, v2InstalledRestored: false },
      },
      "relaunch-plugin-restore",
    )).toThrow("runtime proof failed");
  });

  it("freezes the native and Product Desktop release matrix", async () => {
    const workflow = await readFile(
      join(workspaceRoot, ".github/workflows/desktop.yml"),
      "utf8",
    );
    expect(workflow).toContain("pull_request:\n");
    expect(workflow).toContain("push:\n    branches: [main]");
    expect(workflow).not.toContain("paths:");
    expect(workflow).toContain("needs: verify");
    expect(workflow).toContain(
      "os: ubuntu-24.04\n            target: linux-x64",
    );
    expect(workflow).toContain(
      "os: macos-15-intel\n            target: darwin-x64",
    );
    expect(workflow).toContain(
      "os: windows-2025\n            target: win32-x64",
    );
    expect(workflow).toContain("run: pnpm proof:desktop");
    expect(workflow).toContain(
      "run: pnpm --filter @wanex/desktop prepare:electron",
    );
    expect(workflow.indexOf("run: pnpm --filter @wanex/desktop prepare:electron"))
      .toBeLessThan(workflow.indexOf("run: pnpm proof:desktop"));
    expect(workflow).toContain(
      "run: pnpm proof:tui -- --native-artifact-dir target/distribution/native",
    );
    expect(workflow).toContain(
      "run: node ./scripts/run-linux-keyring-session.mjs pnpm proof:tui -- --native-artifact-dir target/distribution/native",
    );
    expect(workflow).not.toMatch(/run: pnpm proof:tui\s*$/m);
    expect(workflow).toContain(
      "--tui-receipt target/distribution/tui/installed-proof.json",
    );
    expect(workflow).toContain("target/distribution/tui");
    expect(workflow).toContain(
      "target/distribution/product-desktop/electron-artifact.json",
    );
    expect(workflow).toContain(
      "target/distribution/product-desktop/product-desktop-proof-normal.png",
    );
    expect(workflow).toContain(
      "target/distribution/product-desktop/product-desktop-proof-narrow.png",
    );
    expect(workflow).not.toContain(
      "target/distribution/product-desktop/product-desktop-proof.png",
    );
    expect(workflow).not.toContain("--samples");
    expect(workflow).toContain("name: Packed Core Node 24");
    expect(workflow).toContain("run: pnpm security:js");
    expect(workflow).toContain("run: pnpm security:rust");
    expect(workflow).toContain("if: always()");
    const actionRefs = [...workflow.matchAll(/uses: [^@\s]+@([^\s]+)/g)].map(
      (match) => match[1],
    );
    expect(actionRefs).not.toHaveLength(0);
    expect(
      actionRefs.every((reference) => /^[0-9a-f]{40}$/.test(reference)),
    ).toBe(true);
  });
});

function sample(index, temperature, artifactVerification, wallTimeMs) {
  return {
    index,
    temperature,
    wallTimeMs,
    runtime: {
      timingsMs: Object.fromEntries(
        [
          "processToAppReady",
          "artifactVerification",
          "hostStartup",
          "rendererLoad",
          "rendererInteractive",
          "conversationSettlement",
          "rendererPostSettlement",
          "shutdown",
          "interactiveTotal",
          "proofTotal",
        ].map((metric) => [metric, artifactVerification]),
      ),
    },
  };
}

function teamRuntimeReceipt() {
  return {
    kind: "wanex.product-desktop.runtime-receipt",
    ok: true,
    proofStep: "relaunch-team",
    renderer: {
      ok: true,
      step: "relaunch-team",
      providerReady: true,
      providerEvidenceRedacted: true,
      existingAgentSessionAvailable: true,
      groupCreated: true,
      groupSelected: true,
      groupTitleVisible: true,
      coordinatedModeDefault: true,
      zeroAgentStateTruthful: true,
      coordinatorRequired: true,
      coordinatorAssigned: true,
      coordinatorMemberGuards: true,
      contextAutoOpened: true,
      teamTimelineVisible: true,
      teamComposerVisible: true,
      contextVisible: true,
      participantAdded: true,
      participantCount: 1,
      participantNameVisible: true,
      roundSubmitted: true,
      activeRoundObserved: true,
      automaticTerminalRefresh: true,
      roundCompleted: true,
      deliveryReplied: true,
      singleCoordinatorDelivery: true,
      publicAgentReplyVisible: true,
      singlePublicCoordinatorReply: true,
      sessionOnlyComposerAbsent: true,
      sessionOnlyControlsAbsent: true,
      internalIdentityEvidenceHidden: true,
      hostPathEvidenceHidden: true,
      originalSessionRestored: true,
      timingsMs: {
        rendererInteractive: 1,
        conversationSettlement: 2,
        rendererPostSettlement: 3,
      },
    },
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesElectronApi: false,
    },
  };
}

function pluginRuntimeReceipt(step) {
  const common = {
    ok: true,
    step,
    pluginId: "wanex.proof.extension",
    commandId: "wanex.proof.extension.echo",
    v1Version: "1.0.0",
    v2Version: "2.0.0",
    providerEvidenceRedacted: true,
    pathEvidenceHidden: true,
    internalIdentityEvidenceHidden: true,
    timingsMs: {
      rendererInteractive: 1,
      conversationSettlement: 2,
      rendererPostSettlement: 3,
    },
  };
  const renderer = step === "relaunch-plugin-install"
    ? {
        ...common,
        initialEmptyStateVisible: true,
        cancelReviewEvidenceVisible: true,
        reviewCancelled: true,
        cancelledReviewNotInstalled: true,
        v1Installed: true,
        v1CommandAvailable: true,
        v1CommandExecuted: true,
        v1Disabled: true,
        commandAbsentWhileDisabled: true,
        v1Enabled: true,
        commandReturnedAfterEnable: true,
        v2ReviewEvidenceVisible: true,
        attentionVisible: true,
        attentionDiagnosticVisible: true,
        retryAvailable: true,
        retryRecovered: true,
        v2Installed: true,
        v1DisabledAfterReplacement: true,
        singleActiveVersion: true,
        v2CommandExecuted: true,
      }
    : {
        ...common,
        reviewTransientAbsent: true,
        busyTransientAbsent: true,
        v1DisabledRestored: true,
        v2InstalledRestored: true,
        singleActiveVersionRestored: true,
        commandRestored: true,
        restoredCommandExecuted: true,
        v2Removed: true,
        v1Removed: true,
        canonicalRemovedStateVisible: true,
        commandAbsentAfterRemoval: true,
      };
  return {
    kind: "wanex.product-desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    renderer,
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesElectronApi: false,
    },
  };
}

function scheduleRuntimeReceipt(step) {
  const common = {
    ok: true,
    step,
    providerReady: true,
    providerEvidenceRedacted: true,
    internalIdentityEvidenceHidden: true,
    intervalSeconds: 5,
    timingsMs: {
      rendererInteractive: 1,
      conversationSettlement: 2,
      rendererPostSettlement: 3,
    },
  };
  const renderer = step === "relaunch-schedule-create"
    ? {
        ...common,
        visibleFormCreated: true,
        isolatedSessionSelected: true,
        activeModelSelected: true,
        skipMisfireSelected: true,
        enabledAtCreation: true,
        scheduleCreated: true,
        scheduleSessionVisible: true,
        firstUserVisible: true,
        firstPartialResponseVisible: true,
        firstFinalResponseVisible: true,
        disabledBeforeRelease: true,
        disabledQuietWindowObserved: true,
      }
    : {
        ...common,
        restoredDefinitionVisible: true,
        restoredDisabledState: true,
        persistedTranscriptVisible: true,
        reenabled: true,
        restoredExecutionUserVisible: true,
        restoredExecutionResponseVisible: true,
        disabledAfterExecution: true,
        disabledQuietWindowObserved: true,
        removed: true,
        canonicalRemovedStateVisible: true,
      };
  return {
    kind: "wanex.product-desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    renderer,
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesElectronApi: false,
    },
  };
}

async function copyToTemp(source, prefix) {
  const root = await temporaryDirectory(prefix);
  await rm(root, { recursive: true, force: true });
  await cp(source, root, { recursive: true });
  return root;
}

async function createNativeFixture() {
  const root = await temporaryDirectory("wanex-product-desktop-native-");
  const executableDir = join(root, "fixture-target");
  await mkdir(executableDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "runtime-artifacts.json"),
      '{"kind":"fixture"}\n',
      "utf8",
    ),
    writeFile(
      join(executableDir, "wanex-system-service"),
      "fixture-native",
      "utf8",
    ),
  ]);
  return root;
}

async function createCredentialFixture() {
  const root = await temporaryDirectory("wanex-product-desktop-credential-");
  await Promise.all([
    writeFile(
      join(root, "desktop-credential-artifact.json"),
      '{"kind":"fixture"}\n',
      "utf8",
    ),
    writeFile(join(root, "keyring.node"), "fixture-keyring", "utf8"),
  ]);
  return root;
}

async function temporaryDirectory(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}
