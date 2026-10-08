import { createPackage } from "@electron/asar";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditPackagedDesktop,
  auditDesktopStaging,
  assertDesktopMainInputs,
  buildDesktop,
  createDesktopNativeArtifactStagePlan,
  normalizeAsarEntry,
  packageRoot,
  desktopResourcesDir,
  stageDesktopCredentialArtifact,
  stagingDir,
  workspaceRoot,
} from "../scripts/build.mjs";
import {
  materializeInstalledDesktop,
  verifyInstalledDesktopCopy,
} from "../scripts/proof.mjs";
import {
  DESKTOP_PROOF_SAMPLE_COUNT,
  summarizeDesktopSamples,
} from "../scripts/metrics.mjs";
import {
  assertRelaunchJourneyFixtureRequests,
  assertPackagedServerEvidence,
  assertRelaunchJourneyRuntimeReceipt,
  assertCanonicalProofArgs,
  createDesktopProofProcessEnvironment,
  desktopProofProcessExitError,
  measureDesktopSample,
  removeDesktopProofRoot,
} from "../scripts/proof.mjs";
import {
  writeDesktopFailureReport,
} from "../scripts/proof/failure-report.mjs";
import {
  requiredWanexDesktopPackagedProofStep,
} from "../src/packaged-renderer-proof.ts";
import {
  createWanexDesktopProofFailureReceipt,
  formatWanexDesktopError,
} from "../src/proof-failure.ts";
import {
  electronArtifactChecksum,
  electronArtifactFileName,
  electronVersion,
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

describe("Desktop packaging policy", () => {
  it("rejects generic browser assets in the Desktop build graph", () => {
    for (const file of ["client-script", "stylesheet"]) {
      for (const separator of ["/", "\\"]) {
        const path = `packages/assistant-ui/src/generated/${file}.ts`.replaceAll("/", separator);
        expect(() => assertDesktopMainInputs({ inputs: { [path]: {} } }))
          .toThrow("Desktop must not bundle generic browser assets");
      }
    }
    expect(() => assertDesktopMainInputs({ inputs: {
      "apps/desktop/src/main.ts": {},
      "apps/desktop/src/renderer/entry.tsx": {},
      "wanex-desktop-renderer-assets:wanex-desktop-renderer-assets": {},
    } })).not.toThrow();
  });

  it("explains unsupported internal Stores without suggesting an automatic reset", () => {
    const error = new Error("local_persistent_startup: unsupported pre-release store schema: expected [(22, baseline)], found [(8, baseline)]; recreate the store");
    const message = formatWanexDesktopError(error);
    expect(message).toContain("unsupported pre-release store schema");
    expect(message).toContain("WANEX_DESKTOP_PROFILE_ID");
    expect(message).toContain("not reset or migrated");
    expect(formatWanexDesktopError(new Error("connection failed")))
      .not.toContain("WANEX_DESKTOP_PROFILE_ID");
  });

  it("requires an external installation root and verifies the copied package", async () => {
    const sourceRoot = await temporaryDirectory("wanex-installed-source-");
    const sourcePackage = join(sourceRoot, "Wanex.app");
    await mkdir(join(sourcePackage, "Contents"), { recursive: true });
    await writeFile(join(sourcePackage, "Contents", "app.asar"), "asar", "utf8");
    await expect(materializeInstalledDesktop({
      sourcePackageDir: sourcePackage,
      installationRoot: join(workspaceRoot, "target", "invalid-install"),
    })).rejects.toThrow("outside the source workspace");

    const installationRoot = await temporaryDirectory("wanex-installed-copy-");
    const installed = await materializeInstalledDesktop({
      sourcePackageDir: sourcePackage,
      installationRoot: join(installationRoot, "已安装 应用"),
    });
    await expect(verifyInstalledDesktopCopy({
      sourcePackageDir: sourcePackage,
      installedPackageDir: installed.packageDir,
    })).resolves.toEqual({
      packageFileCount: 1,
      packageBytes: 4,
    });
    await writeFile(join(installed.packageDir, "Contents", "app.asar"), "changed", "utf8");
    await expect(verifyInstalledDesktopCopy({
      sourcePackageDir: sourcePackage,
      installedPackageDir: installed.packageDir,
    })).rejects.toThrow("differs from its source package");
  });

  it("refreshes the host native artifact as part of Desktop packaging", () => {
    const plan = createDesktopNativeArtifactStagePlan({
      workspaceRoot,
      platform: "darwin",
      arch: "arm64",
      nodeExecutable: "/usr/local/bin/node",
    });
    expect(plan).toEqual({
      command: "/usr/local/bin/node",
      args: [
        expect.stringContaining("tsx"),
        join(workspaceRoot, "scripts/stage-native-artifact.ts"),
        "--target",
        "darwin-arm64",
      ],
      cwd: workspaceRoot,
      targetId: "darwin-arm64",
    });
  });

  it("builds one dependency-free application bundle with a private preload", async () => {
    await expect(buildDesktop()).resolves.toEqual({
      kind: "wanex.desktop.staging-receipt",
      fileCount: 3,
      bytes: expect.any(Number),
      hasNodeModules: false,
    });
    const manifest = JSON.parse(
      await readFile(join(stagingDir, "package.json"), "utf8"),
    );
    expect(manifest.assistantName).toBe("Wanex");
    expect(manifest).not.toHaveProperty("dependencies");
    const main = await readFile(join(stagingDir, "main.cjs"), "utf8");
    const preload = await readFile(join(stagingDir, "preload.cjs"), "utf8");
    expect(main).toContain("data-ui-product-renderer");
    expect(preload).toContain("wanexServer");
    expect(preload).toContain("contextBridge");
    expect(preload).not.toContain(workspaceRoot);
    expect(main).not.toMatch(/(?:\bfrom\s*|\bimport\s*\()\s*["']@wanex\//);
    expect(main).not.toContain(workspaceRoot);
    expect(main).not.toContain("sourceMappingURL");
    expect(main).not.toMatch(
      /(?:\bimport\s*\(|\brequire\s*\()\s*["']@wanex\/local-credential-store\/keychain["']/,
    );
    expect(main).toContain(
      "Desktop requires its verified injected credential binding",
    );
  });

  it("limits Desktop dependencies to explicit composition and UI owners", async () => {
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      "@radix-ui/react-dialog",
      "@wanex/assistant-host",
      "@wanex/assistant-plugin-host",
      "@wanex/assistant-ui",
      "@wanex/local-credential-store",
      "@wanex/plugin",
      "@wanex/protocol",
      "@wanex/runtime",
      "@wanex/workspace",
      "lucide-react",
      "react",
      "react-dom",
    ].sort());
  });

  it("freezes the semantic IPC and exact-origin renderer policy", async () => {
    const main = await readFile(join(packageRoot, "src/main.ts"), "utf8");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");
    expect(main).toContain('action: "deny"');
    expect(main).toContain('on("will-navigate"');
    expect(main).toContain("setPermissionRequestHandler");
    expect(main).toContain("setPermissionCheckHandler");
    expect(main).toContain("startAssistantWebApp");
    expect(main).toContain("loadURL(assistant.url)");
    expect(main).toContain("ipcMain");
    expect(main).toContain("preload:");
    expect(main).not.toContain("@wanex/runtime");
    expect(main).not.toContain("loadFile(");
  });

  it("requires a prepared, checksum-verified Electron artifact", async () => {
    const fileName = electronArtifactFileName({
      version: electronVersion,
      platform: "darwin",
      arch: "arm64",
    });
    expect(fileName).toBe(`electron-v${electronVersion}-darwin-arm64.zip`);
    expect(electronArtifactChecksum(fileName)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => electronArtifactChecksum(`electron-v${electronVersion}-unknown.zip`))
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
      path: await realpath(filePath),
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
    const root = await temporaryDirectory("wanex-desktop-keyring-");
    const binaryPath = join(root, "fixture.node");
    await writeFile(binaryPath, "fixture-keyring", "utf8");
    await expect(
      stageDesktopCredentialArtifact({
        platform: "darwin",
        arch: "arm64",
        binaryPath,
      }),
    ).resolves.toMatchObject({
      kind: "wanex.desktop.credential-staging-receipt",
      target: "darwin-arm64",
      fileCount: 2,
      bytes: 15,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects staging dependencies and unexpected files", async () => {
    await buildDesktop();
    const root = await copyToTemp(stagingDir, "wanex-desktop-stage-");
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.dependencies = { bad: "1.0.0" };
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await expect(auditDesktopStaging(root)).rejects.toThrow(
      "must not declare dependencies",
    );
    delete manifest.dependencies;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await writeFile(join(root, "unexpected.cjs"), "module.exports = {}\n", "utf8");
    await expect(auditDesktopStaging(root)).rejects.toThrow(
      "unexpected files",
    );
  });

  it("audits one ASAR and both exact external native resources", async () => {
    await buildDesktop();
    const root = await temporaryDirectory("wanex-desktop-package-");
    const stagedNativeDir = await createNativeFixture();
    const stagedCredentialDir = await createCredentialFixture();
    const resources = desktopResourcesDir(root);
    await mkdir(resources, { recursive: true });
    await createPackage(stagingDir, join(resources, "app.asar"));
    await Promise.all([
      cp(stagedNativeDir, join(resources, "native"), { recursive: true }),
      cp(stagedCredentialDir, join(resources, "credentials"), {
        recursive: true,
      }),
    ]);
    await expect(
      auditPackagedDesktop({
        packageDir: root,
        stagedNativeDir,
        stagedCredentialDir,
      }),
    ).resolves.toMatchObject({
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false,
      asarEntryCount: 3,
      nativeFileCount: 2,
      credentialFileCount: 2,
    });
    await writeFile(
      join(resources, "credentials", "keyring.node"),
      "tampered",
      "utf8",
    );
    await expect(
      auditPackagedDesktop({
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

  it("freezes one cold and four warm Desktop samples", () => {
    expect(DESKTOP_PROOF_SAMPLE_COUNT).toBe(5);
    expect(assertCanonicalProofArgs([])).toBeUndefined();
    expect(assertCanonicalProofArgs(["--"])).toBeUndefined();
    expect(() => assertCanonicalProofArgs(["--samples", "5"])).toThrow(
      "unknown Desktop proof argument",
    );
    expect(
      summarizeDesktopSamples([
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
        rendererStartupMs: { total: 50 },
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
        rendererStartupMetrics: {
          total: {
            medianMs: 25,
            maximumMs: 40,
            samplesMs: [10, 20, 30, 40],
          },
        },
      },
    });
  });

  it("rejects a Desktop sample without exact Renderer startup evidence", () => {
    const samples = [
      sample(0, "cold", 50, 500),
      sample(1, "warm", 10, 100),
      sample(2, "warm", 20, 200),
      sample(3, "warm", 30, 300),
      sample(4, "warm", 40, 400),
    ];
    delete samples[0].runtime.rendererStartupMs;
    expect(() => summarizeDesktopSamples(samples)).toThrow(
      "Desktop Renderer startup navigationToBootstrap timing",
    );
  });

  it("keeps process inspection mandatory and outside wall time", async () => {
    let now = 0;
    let audited = false;
    await expect(
      measureDesktopSample(
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
      measureDesktopSample(
        async () => ({ stdout: "", stderr: "" }),
        async () => {
          throw new Error("process inspection failed");
        },
      ),
    ).rejects.toThrow("process inspection failed");
  });

  it("treats a successful process exit without a runtime receipt as failure", () => {
    expect(desktopProofProcessExitError({
      code: 0,
      signal: null,
      runtimeReceipt: "",
    })).toMatchObject({
      message: "packaged Desktop exited with 0 without required runtime receipt",
    });
    expect(desktopProofProcessExitError({
      code: 0,
      signal: null,
      runtimeReceipt: '{"ok":true}',
    })).toBeUndefined();
  });

  it("removes inherited proof secrets from Provider relaunch processes", () => {
    const environment = createDesktopProofProcessEnvironment(
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
    const root = await temporaryDirectory("wanex-desktop-cleanup-");
    const sealed = join(root, "extensions", "plugin", "1.0.0", "digest", "bin");
    const executable = join(sealed, "plugin-host");
    await mkdir(sealed, { recursive: true });
    await writeFile(executable, "fixture", "utf8");
    if (process.platform !== "win32") {
      await chmod(executable, 0o555);
      await chmod(sealed, 0o555);
    }

    await removeDesktopProofRoot(root);
    tempDirs.splice(tempDirs.indexOf(root), 1);
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
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
    const providerResponses = Array.from({ length: 70 }, (_, index) => ({
      kind: index % 2 === 0 ? "chat_completion" : "image_generation",
      modelClass: index === 0 ? "lifecycle_selected" : "other",
      state: index === 1 ? "closed_early" : "finished",
      model: `secret-response-model-${index}`,
    }));

    const report = await writeDesktopFailureReport({
      error: new Error("bounded fixture evidence"),
      proofRoot,
      providerRequests,
      providerResponses,
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
      modelClass: "lifecycle_selected",
      responseState: "finished",
    });
    expect(report.providerFixture.requests[1]).toEqual({
      kind: "image_generation",
      authorized: true,
      modelClass: "other",
      responseState: "closed_early",
    });
    const persisted = await readFile(
      join(outputRoot, "desktop-report.json"),
      "utf8",
    );
    expect(persisted).not.toMatch(
      /secret-model|secret-response-model|secret-message|chat\/completions/,
    );
  });

  it.each([
    "command_menu", "command_palette", "command_selection", "command_preview",
    "command_execution", "command_close", "secret_untrusted_stage",
  ])("bounds Renderer failure stage %s in durable evidence", async (failureStage) => {
    const proofRoot = await temporaryDirectory("wanex-renderer-stage-root-");
    const outputRoot = await temporaryDirectory("wanex-renderer-stage-report-");
    await writeFile(
      join(proofRoot, "runtime-receipt-0.json"),
      JSON.stringify({
        kind: "wanex.desktop.runtime-receipt",
        ok: false,
        failurePhase: "renderer_proof",
        error: { name: "Error", code: "desktop_renderer_proof_failed" },
        renderer: {
          ok: false,
          failureStage,
          providerConfigured: false,
        },
      }),
      "utf8",
    );

    const report = await writeDesktopFailureReport({
      error: new Error("renderer failed"),
      proofRoot,
      outputRoot,
    });

    expect(report.runtimeFailures[0]?.renderer?.failureStage).toBe(
      failureStage === "secret_untrusted_stage" ? "unknown_stage" : failureStage,
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

  it("accepts only a ready packaged Server", () => {
    const evidence = {
      endpoint: "https://localhost:8443/v1/agent-host/message",
      serverUrl: "https://localhost:8443/",
      caPath: "/tmp/localhost.crt",
      status: {
        state: "open",
        assistant: "ready",
        listener: "ready",
      },
      stderr: "",
    };
    expect(() => assertPackagedServerEvidence(evidence)).not.toThrow();
    expect(() => assertPackagedServerEvidence({
      ...evidence,
      endpoint: "https://localhost:8443/invalid",
    })).toThrow("packaged Server evidence is invalid");
    expect(() => assertPackagedServerEvidence({
      ...evidence,
      stderr: "unexpected error",
    })).toThrow("packaged Server evidence is invalid");
  });

  it("accepts exact packaged Remote Assistant first-launch and restore receipts", () => {
    const first = remoteAssistantRuntimeReceipt("relaunch-remote-assistant");
    const restore = remoteAssistantRuntimeReceipt(
      "relaunch-remote-assistant-restore",
    );
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      first,
      "relaunch-remote-assistant",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      restore,
      "relaunch-remote-assistant-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt({
      ...first,
      renderer: {
        ...first.renderer,
        switchedToLocalWhileRemoteRunning: false,
      },
    }, "relaunch-remote-assistant")).toThrow("runtime proof failed");
    expect(() => assertRelaunchJourneyRuntimeReceipt({
      ...restore,
      renderer: {
        ...restore.renderer,
        credentialResolvedAfterRelaunch: false,
      },
    }, "relaunch-remote-assistant-restore")).toThrow("runtime proof failed");
  });

  it("requires exact Remote Assistant Provider release evidence", () => {
    expect(() => assertRelaunchJourneyFixtureRequests([{
      path: "/v1/chat/completions",
      model: "desktop-proof-remote-assistant-model",
      authorized: true,
      remoteAssistantPhase: "held",
      remoteAssistantReleaseReceived: true,
      remoteAssistantSettled: true,
      remoteAssistantClientClosed: false,
    }], "relaunch-remote-assistant")).not.toThrow();
    expect(() => assertRelaunchJourneyFixtureRequests(
      [],
      "relaunch-remote-assistant-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyFixtureRequests([{
      path: "/v1/chat/completions",
      model: "desktop-proof-remote-assistant-model",
      authorized: true,
      remoteAssistantPhase: "held",
      remoteAssistantReleaseReceived: false,
      remoteAssistantSettled: false,
      remoteAssistantClientClosed: false,
    }], "relaunch-remote-assistant")).toThrow(
      "Remote Assistant Provider requests are invalid",
    );
  });

  it("accepts only exact packaged Remote Media evidence", () => {
    const runtime = remoteMediaRuntimeReceipt("relaunch-remote-media");
    const restore = remoteMediaRuntimeReceipt("relaunch-remote-media-restore");
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      runtime,
      "relaunch-remote-media",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt(
      restore,
      "relaunch-remote-media-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyRuntimeReceipt({
      ...runtime,
      renderer: { ...runtime.renderer, capabilityRetired: false },
    }, "relaunch-remote-media")).toThrow("runtime proof failed");

    const requests = remoteMediaProviderRequests();
    expect(() => assertRelaunchJourneyFixtureRequests(
      requests,
      "relaunch-remote-media",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyFixtureRequests(
      requests.map((request, index) => index === 0
        ? { ...request, model: "desktop-proof-relaunch-model" }
        : request),
      "relaunch-remote-media",
    )).toThrow("Remote Media Provider requests are invalid");
    expect(() => assertRelaunchJourneyFixtureRequests(
      [],
      "relaunch-remote-media-restore",
    )).not.toThrow();
    expect(() => assertRelaunchJourneyFixtureRequests(
      requests.slice(0, 1),
      "relaunch-remote-media-restore",
    )).toThrow("restore unexpectedly invoked Provider");
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

  it("keeps focused Windows installed acceptance manual and independent of release", async () => {
    const workflow = await readFile(
      join(workspaceRoot, ".github/workflows/windows-installed.yml"),
      "utf8",
    );
    expect(workflow).toContain("on:\n  workflow_dispatch:\n");
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule|workflow_run):/m);
    expect(workflow.match(/runs-on:/g)).toHaveLength(1);
    expect(workflow).toContain("runs-on: windows-2025");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/\b(matrix|needs|continue-on-error):/);
    expect(workflow).not.toMatch(/release:|publish|audit-level|ignore-advisories/);
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm stage:native -- --target win32-x64");
    expect(workflow).toContain("WANEX_SYSTEM_SERVICE_BIN: ${{ github.workspace }}/target/distribution/native/win32-x64/wanex-system-service.exe");
    for (const command of [
      "pnpm check:desktop",
      "pnpm test:desktop",
      "pnpm --filter @wanex/desktop prepare:electron",
      "pnpm proof:desktop",
      "pnpm proof:native-runtime -- --artifact-dir target/distribution/native",
      "pnpm proof:tui -- --native-artifact-dir target/distribution/native",
      "pnpm proof:desktop-distribution -- --target win32-x64",
      "pnpm audit:host-distribution -- --target win32-x64",
    ]) expect(workflow).toContain(`run: ${command}\n`);
    expect(workflow.indexOf("run: pnpm stage:native"))
      .toBeLessThan(workflow.indexOf("run: pnpm test:desktop"));
    expect(workflow.indexOf("run: pnpm --filter @wanex/desktop prepare:electron"))
      .toBeLessThan(workflow.indexOf("run: pnpm proof:desktop\n"));
    expect(workflow).toContain("if: always()");
    for (const receipt of [
      "native-runtime-proof.json", "desktop-report.json",
      "desktop-distribution-receipt.json", "host-distribution-audit-win32-x64.json",
      "target/distribution/tui",
    ]) expect(workflow).toContain(receipt);
    expect(workflow).not.toContain("--samples");
    const refs = [...workflow.matchAll(/uses: [^@\s]+@([^\s]+)/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => /^[a-f0-9]{40}$/.test(ref))).toBe(true);
  });

  it("freezes the native and Desktop release matrix", async () => {
    const workflow = await readFile(
      join(workspaceRoot, ".github/workflows/desktop.yml"),
      "utf8",
    );
    expect(workflow).toContain("pull_request:\n");
    expect(workflow).toContain("push:\n    branches: [main]");
    expect(workflow).not.toContain("paths:");
    expect(workflow.match(/pnpm verify/g)).toHaveLength(1);
    const verifyBlock = workflow.slice(
      workflow.indexOf("  verify:"),
      workflow.indexOf("  packed-core-node24:"),
    );
    expect(verifyBlock).toContain("runs-on: ubuntu-24.04");
    expect(verifyBlock).not.toContain("matrix.target");
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
      "run: pnpm proof:desktop-distribution -- --target ${{ matrix.target }}",
    );
    expect(workflow).toContain(
      "run: pnpm --filter @wanex/desktop prepare:electron",
    );
    expect(workflow).toContain(
      "run: pnpm test:desktop\n        env:\n" +
      "          WANEX_SYSTEM_SERVICE_BIN: ${{ github.workspace }}/target/distribution/native/${{ matrix.target }}/${{ matrix.target == 'win32-x64' && 'wanex-system-service.exe' || 'wanex-system-service' }}",
    );
    expect(workflow.indexOf("run: pnpm --filter @wanex/desktop prepare:electron"))
      .toBeLessThan(workflow.indexOf("run: pnpm proof:desktop"));
    expect(workflow).toContain(
      "run: pnpm proof:tui -- --native-artifact-dir target/distribution/native",
    );
    expect(workflow).toContain(
      "run: pnpm test:server-distribution-proof",
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
      "target/distribution/server/server-distribution-proof.json",
    );
    expect(workflow).toContain(
      "target/distribution/desktop/electron-artifact.json",
    );
    expect(workflow).toContain(
      "target/distribution/desktop/desktop-distribution-receipt.json",
    );
    expect(workflow).toContain(
      "--desktop-distribution-receipt target/distribution/desktop/desktop-distribution-receipt.json",
    );
    expect(workflow).toContain(
      "target/distribution/desktop/desktop-proof-normal.png",
    );
    expect(workflow).toContain(
      "target/distribution/desktop/desktop-proof-narrow.png",
    );
    expect(workflow).not.toContain(
      "target/distribution/desktop/desktop-proof.png",
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
          "windowInitialization",
          "artifactVerification",
          "credentialResolution",
          "startupPrerequisites",
          "hostStartup",
          "rendererNavigation",
          "rendererInteractive",
          "journeyPreparation",
          "conversationSettlement",
          "rendererPostSettlement",
          "shutdown",
          "interactiveTotal",
          "proofTotal",
        ].map((metric) => [metric, artifactVerification]),
      ),
      rendererStartupMs: {
        navigationToBootstrap: artifactVerification,
        bootstrapToRootCommit: 0,
        rootCommitToSnapshotRequest: 0,
        initialSnapshot: 0,
        snapshotResponseToAssistantSurface: 0,
        assistantSurfaceToInteractivePaint: 0,
        total: artifactVerification,
      },
    },
  };
}

function teamRuntimeReceipt() {
  return {
    kind: "wanex.desktop.runtime-receipt",
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
        journeyPreparation: 1,
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
      journeyPreparation: 1,
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
    kind: "wanex.desktop.runtime-receipt",
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
      journeyPreparation: 1,
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
    kind: "wanex.desktop.runtime-receipt",
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

function remoteAssistantRuntimeReceipt(step) {
  const first = step === "relaunch-remote-assistant";
  return {
    kind: "wanex.desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    renderer: {
      ok: true,
      step,
      providerEvidenceRedacted: true,
      profileSavedThroughVisibleForm: first,
      profilePersisted: true,
      credentialAbsentFromRenderer: true,
      serverUrlAbsentFromRenderer: true,
      authenticationFailureVisible: first,
      authenticationFailurePreservedLocal: first,
      credentialCorrectedThroughVisibleForm: first,
      remoteLocationSelected: true,
      remoteModelReady: true,
      remoteMessageSubmitted: first,
      remotePartialVisible: first,
      switchedToLocalWhileRemoteRunning: first,
      localTranscriptRestored: true,
      remotePromptAbsentLocally: true,
      sessionIdentityIsolated: true,
      remoteTranscriptReconciled: true,
      remoteFinalResponseVisible: true,
      remoteTransientAbsent: true,
      attachmentUploadAvailable: true,
      hostLocalAdministrationUnavailable: true,
      profileRestoredAfterRelaunch: !first,
      credentialResolvedAfterRelaunch: !first,
      internalIdentityEvidenceHidden: true,
      timingsMs: {
        journeyPreparation: 1,
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

function remoteMediaRuntimeReceipt(step) {
  const upload = step === "relaunch-remote-media";
  return {
    kind: "wanex.desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    renderer: {
      ok: true,
      step,
      providerEvidenceRedacted: true,
      profileRestored: true,
      remoteLocationSelected: true,
      remoteModelReady: true,
      sessionId: "session_remote_media",
      ...(upload ? {
        attachmentPickerVisible: true,
        unsupportedAttachmentRejected: true,
        unsupportedDraftPreserved: true,
        attachmentPreviewVisible: true,
        attachmentCapabilityUrlLocal: true,
        multimodalConversationSubmitted: true,
        multimodalResponseVisible: true,
        uploadedResourceVisible: true,
        imageGenerationToolSucceeded: true,
        generatedResourceVisible: true,
        generatedResourceEvidenceValid: true,
        generatedPreviewVisible: true,
        staleUploadRejected: true,
        staleUploadAbsent: true,
      } : {
        uploadedTranscriptRestored: true,
        uploadedResourceRestored: true,
        uploadedPreviewRestored: true,
        generatedTranscriptRestored: true,
        generatedResourceRestored: true,
        generatedPreviewRestored: true,
        attachmentDraftEmpty: true,
      }),
      remoteEvidenceHidden: true,
      capabilityRetired: true,
      timingsMs: {
        journeyPreparation: 1,
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

function remoteMediaProviderRequests() {
  const conversation = {
    path: "/v1/chat/completions",
    model: "desktop-proof-remote-assistant-model",
    authorized: true,
    imageInputCount: 1,
    imageBytes: 68,
    imageMediaTypes: ["image/png"],
  };
  return [conversation, {
    ...conversation,
    imageGenerationPhase: "tool_call",
  }, {
    path: "/v1/images/generations",
    model: "desktop-proof-image-model",
    authorized: true,
    imageGenerationPhase: "media",
    generatedImageCount: 1,
    generatedImageBytes: 68,
    generatedImageMediaTypes: ["image/png"],
  }, {
    ...conversation,
    imageGenerationPhase: "final",
  }];
}

async function copyToTemp(source, prefix) {
  const root = await temporaryDirectory(prefix);
  await rm(root, { recursive: true, force: true });
  await cp(source, root, { recursive: true });
  return root;
}

async function createNativeFixture() {
  const root = await temporaryDirectory("wanex-desktop-native-");
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
  const root = await temporaryDirectory("wanex-desktop-credential-");
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
