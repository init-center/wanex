import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type Event as ElectronEvent,
  type OpenDialogOptions,
} from "electron";
import {
  startAssistantWebApp,
  localSecretNamespace,
  type LocalStorageConfig,
  type AssistantWebApp,
} from "@wanex/assistant-host";
import { createWanexLocalKeychainSecretStoreFromBinding } from "@wanex/local-credential-store/binding";
import { resolveLocalSystemService } from "@wanex/assistant-host/system-service";
import {
  loadWanexDesktopCredentialBinding,
  resolveWanexDesktopCredentialArtifact,
  WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE,
} from "./credential-artifact.js";
import { createWanexDesktopOwnedLifecycle } from "./lifecycle.js";
import {
  requiredWanexDesktopPackagedProofStep,
  runWanexDesktopPackagedRendererProof,
  DesktopRendererProofError,
} from "./packaged-renderer-proof.js";
import {
  createWanexDesktopProofFailureReceipt,
  formatWanexDesktopError,
} from "./proof-failure.js";
import {
  isWanexDesktopOwnedNavigation,
  resolveWanexDesktopWindowChrome,
  type WanexDesktopWindowChromePolicy,
} from "./window-policy.js";
import {
  createDesktopExtensionComposition,
  createDesktopExtensionProofComposition,
  createDesktopExtensionProofSelectionQueue,
  selectLocalExtensionDirectory,
} from "./extensions.js";
import { WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED } from "./proof-contract.js";
import {
  createDesktopCodingComposition,
  createDesktopCodingProofSelectionQueue,
  type DesktopCodingComposition,
} from "./coding.js";
import { createDesktopExecutionEnvironment } from "./execution.js";
import { createDesktopCodingRecoveryProofContext } from "./coding-proof.js";
import {
  installDesktopCodingIpc,
} from "./coding-ipc.js";
import { desktopRendererAssets } from "./renderer-assets.js";

const processStartedAt = performance.now();
const proofReceiptPath = process.env.WANEX_DESKTOP_PROOF_RECEIPT;
const proofNormalScreenshotPath =
  process.env.WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT;
const proofNarrowScreenshotPath =
  process.env.WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT;
const proofUserDataPath = process.env.WANEX_DESKTOP_PROOF_USER_DATA;
const proofProfileId = process.env.WANEX_DESKTOP_PROOF_PROFILE_ID;
const proofProviderBaseUrl = process.env.WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL;
const proofProviderCredential = process.env.WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL;
const proofStep = process.env.WANEX_DESKTOP_PROOF_STEP;
const proofExtensionSelections =
  process.env.WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS;
const proofCodingProjectSelections =
  process.env.WANEX_DESKTOP_PROOF_CODING_PROJECT_SELECTIONS;

if (proofUserDataPath !== undefined) {
  app.setPath("userData", proofUserDataPath);
}
app.setName("Wanex");
app.setAppUserModelId("com.wanex.assistant.desktop");
app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>");

let assistant: AssistantWebApp | undefined;
let coding: DesktopCodingComposition | undefined;
let removeCodingIpc: (() => void) | undefined;
let window: BrowserWindow | undefined;
let exitAllowed = false;
let exitCode = 0;
let failurePhase = "electron_startup";
const lifecycle = createWanexDesktopOwnedLifecycle(async () => {
  window?.destroy();
  window = undefined;
  removeCodingIpc?.();
  removeCodingIpc = undefined;
  const ownedCoding = coding;
  coding = undefined;
  await ownedCoding?.close();
  const ownedAssistant = assistant;
  assistant = undefined;
  await ownedAssistant?.close();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  installAppLifecycle();
  void start().catch(async (error: unknown) => {
    console.error(formatWanexDesktopError(error));
    await writeProofReceipt(createWanexDesktopProofFailureReceipt({
      error,
      failurePhase,
      ...(proofStep === undefined ? {} : { proofStep }),
    }));
    await shutdown(1);
  });
}

async function start(): Promise<void> {
  await app.whenReady();
  const windowChrome = resolveWanexDesktopWindowChrome(process.platform);
  failurePhase = "system_service_resolution";
  const appReadyAt = performance.now();
  const storage: LocalStorageConfig = {
    kind: "profile",
    rootDir: app.getPath("userData"),
    profileId: proofReceiptPath === undefined
      ? "default"
      : requiredProofValue(proofProfileId, "profile ID"),
    mode: "persistent",
  };
  const service = await resolveDesktopSystemService();
  failurePhase = "credential_store_resolution";
  const artifactVerifiedAt = performance.now();
  const credentialStore = await createDesktopCredentialStore(storage);
  const proofSelection = createDesktopExtensionProofSelectionQueue({
    proofEnabled: proofReceiptPath !== undefined,
    serializedSelections: proofExtensionSelections,
  });
  if (
    proofCodingProjectSelections !== undefined &&
    proofStep !== "relaunch-coding"
  ) {
    throw new Error(
      "Desktop Coding proof selections are only valid for the Coding proof step",
    );
  }
  const codingProofSelection = createDesktopCodingProofSelectionQueue({
    proofEnabled: proofReceiptPath !== undefined,
    serializedSelections: proofCodingProjectSelections,
  });
  if (proofStep === "relaunch-coding" && codingProofSelection === undefined) {
    throw new Error(
      "Desktop Coding proof requires a serialized project selection",
    );
  }
  const pluginCompositionOptions = {
    userDataDir: app.getPath("userData"),
    selectLocalPackage: proofSelection ?? (async () =>
      await selectLocalExtensionDirectory(async () => {
        const options: OpenDialogOptions = {
          title: "Add local extension",
          buttonLabel: "Review extension",
          properties: ["openDirectory", "dontAddToRecent"],
        };
        const owner = window;
        return owner === undefined || owner.isDestroyed()
          ? await dialog.showOpenDialog(options)
          : await dialog.showOpenDialog(owner, options);
      })),
  };
  const pluginComposition = proofStep === "relaunch-plugin-install"
    ? createDesktopExtensionProofComposition({
        ...pluginCompositionOptions,
        proofEnabled: proofReceiptPath !== undefined,
        failHostCreationOnce: {
          pluginId: WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED.pluginId,
          version: WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED.v2Version,
        },
      })
    : createDesktopExtensionComposition(pluginCompositionOptions);
  failurePhase = "assistant_host_startup";
  assistant = await startAssistantWebApp({
    storage,
    serviceBin: service.path,
    credentialStore,
    pluginComposition,
    web: {
      hostname: "127.0.0.1",
      port: 0,
      browserAssets: desktopRendererAssets,
      windowChrome: windowChrome.documentChrome,
    },
  });
  const hostReadyAt = performance.now();
  failurePhase = "coding_composition_setup";
  coding = createDesktopCodingComposition({
    storage,
    dataDir: join(app.getPath("userData"), "coding"),
    serviceBin: service.path,
    executionEnvironmentFactory: ({ environmentId, serviceBin }) =>
      createDesktopExecutionEnvironment({
        kind: process.platform === "darwin" ? "macos-seatbelt" : "native",
        environmentId,
        serviceBin,
      }),
    secretResolver: assistant.secretResolver,
    ...(proofStep === "relaunch-coding"
      ? { baseAgentContext: createDesktopCodingRecoveryProofContext() }
      : {}),
    resolveModelEndpointId: async () =>
      (await assistant?.modelEndpoints.readActiveModelEndpoint())?.id,
  });
  failurePhase = "renderer_load";
  window = createAssistantWindow(assistant.url, windowChrome);
  removeCodingIpc = installDesktopCodingIpc({
    ipcMain,
    composition: coding,
    getWindow: () => window,
    selectProject: codingProofSelection ?? selectCodingProjectDirectory,
  });
  await window.loadURL(assistant.url);
  const rendererReadyAt = performance.now();

  if (proofReceiptPath !== undefined) {
    failurePhase = "renderer_proof";
    await runPackagedProof({
      appReadyAt,
      artifactVerifiedAt,
      hostReadyAt,
      rendererReadyAt,
      ...(service.targetId === undefined ? {} : { targetId: service.targetId }),
    });
    return;
  }
  window.show();
}

function installAppLifecycle(): void {
  app.on("second-instance", () => {
    if (window === undefined || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on("activate", () => {
    if (
      assistant !== undefined &&
      (window === undefined || window.isDestroyed())
    ) {
      window = createAssistantWindow(
        assistant.url,
        resolveWanexDesktopWindowChrome(process.platform),
      );
      void window.loadURL(assistant.url).then(() => window?.show());
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") void shutdown(0);
  });
  app.on("before-quit", (event: ElectronEvent) => {
    if (exitAllowed || lifecycle.state === "closed") return;
    event.preventDefault();
    void shutdown(exitCode);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }
}

function createAssistantWindow(
  assistantUrl: string,
  chrome: WanexDesktopWindowChromePolicy,
): BrowserWindow {
  const created = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: chrome.title,
    ...(chrome.titleBarStyle === undefined
      ? {}
      : { titleBarStyle: chrome.titleBarStyle }),
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "preload.cjs"),
    },
  });
  if (chrome.documentChrome === "integrated-macos") {
    created.on("page-title-updated", (event) => event.preventDefault());
  }
  const ownedOrigin = new URL(assistantUrl).origin;
  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  created.webContents.on("will-navigate", (event, url) => {
    if (!isWanexDesktopOwnedNavigation(url, ownedOrigin))
      event.preventDefault();
  });
  created.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  created.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  created.webContents.session.setPermissionCheckHandler(() => false);
  created.on("closed", () => {
    if (window === created) window = undefined;
  });
  return created;
}

async function selectCodingProjectDirectory(): Promise<string | undefined> {
  const owner = window;
  const result = owner === undefined || owner.isDestroyed()
    ? await dialog.showOpenDialog({
        title: "Open project",
        buttonLabel: "Open project",
        properties: ["openDirectory", "dontAddToRecent"],
      })
    : await dialog.showOpenDialog(owner, {
        title: "Open project",
        buttonLabel: "Open project",
        properties: ["openDirectory", "dontAddToRecent"],
      });
  if (result.canceled || result.filePaths.length !== 1) return undefined;
  const selected = result.filePaths[0]?.trim();
  return selected === undefined || selected.length === 0 ? undefined : selected;
}

async function resolveDesktopSystemService() {
  if (!app.isPackaged) {
    return await resolveLocalSystemService({
      kind: "installed",
      env: process.env,
    });
  }
  const nativeDir = join(process.resourcesPath, "native");
  const manifest = JSON.parse(
    await readFile(join(nativeDir, "runtime-artifacts.json"), "utf8"),
  ) as unknown;
  return await resolveLocalSystemService({
    kind: "artifact",
    manifest,
    artifactDir: nativeDir,
    checkExecutable: process.platform !== "win32",
  });
}

async function createDesktopCredentialStore(
  storage: LocalStorageConfig,
) {
  const artifactDir = app.isPackaged
    ? join(process.resourcesPath, "credentials")
    : process.env.WANEX_DESKTOP_CREDENTIAL_DIR;
  if (artifactDir === undefined) {
    throw new Error(
      "desktop credential artifact is required outside packaged proof mode",
    );
  }
  const manifest = JSON.parse(
    await readFile(
      join(artifactDir, WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE),
      "utf8",
    ),
  ) as unknown;
  const artifact = await resolveWanexDesktopCredentialArtifact({
    manifest,
    artifactDir,
  });
  const binding = await loadWanexDesktopCredentialBinding({ artifact });
  return createWanexLocalKeychainSecretStoreFromBinding({
    namespace: localSecretNamespace(storage),
    binding,
  });
}

async function runPackagedProof(timings: {
  readonly appReadyAt: number;
  readonly artifactVerifiedAt: number;
  readonly hostReadyAt: number;
  readonly rendererReadyAt: number;
  readonly targetId?: string;
}): Promise<void> {
  const activeWindow = window;
  if (activeWindow === undefined)
    throw new Error("desktop proof window is missing");
  activeWindow.show();
  const step = requiredWanexDesktopPackagedProofStep(proofStep);
  const renderer = await runWanexDesktopPackagedRendererProof({
    window: activeWindow,
    step,
    ...(proofProviderBaseUrl === undefined
      ? {}
      : { providerBaseUrl: proofProviderBaseUrl }),
    ...(proofProviderCredential === undefined
      ? {}
      : { providerCredential: proofProviderCredential }),
  });
  if (!renderer.ok) throw new DesktopRendererProofError(renderer);
  let screenshots;
  if (step === "lifecycle") {
    failurePhase = "normal_screenshot";
    activeWindow.setContentSize(1280, 748, false);
    await waitForRendererPaint(activeWindow);
    const normalScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(
        proofNormalScreenshotPath,
        "normal screenshot path",
      ),
    );

    failurePhase = "narrow_screenshot";
    activeWindow.setContentSize(760, 748, false);
    await waitForRendererPaint(activeWindow);
    const narrowScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(
        proofNarrowScreenshotPath,
        "narrow screenshot path",
      ),
    );
    screenshots = { normal: normalScreenshot, narrow: narrowScreenshot };
  }
  failurePhase = "proof_cleanup";
  if (step === "lifecycle") await removeProofProviders();
  const shutdownStartedAt = performance.now();
  await lifecycle.close();
  const stoppedAt = performance.now();
  await writeProofReceipt({
    kind: "wanex.desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    ...(timings.targetId === undefined ? {} : { target: timings.targetId }),
    renderer,
    ...(screenshots === undefined ? {} : { screenshots }),
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesElectronApi: false,
    },
    timingsMs: {
      processToAppReady: elapsed(processStartedAt, timings.appReadyAt),
      artifactVerification: elapsed(
        timings.appReadyAt,
        timings.artifactVerifiedAt,
      ),
      hostStartup: elapsed(timings.artifactVerifiedAt, timings.hostReadyAt),
      rendererLoad: elapsed(timings.hostReadyAt, timings.rendererReadyAt),
      rendererInteractive: renderer.timingsMs.rendererInteractive,
      conversationSettlement: renderer.timingsMs.conversationSettlement,
      rendererPostSettlement: renderer.timingsMs.rendererPostSettlement,
      shutdown: elapsed(shutdownStartedAt, stoppedAt),
      interactiveTotal: round(
        elapsed(processStartedAt, timings.rendererReadyAt) +
          renderer.timingsMs.rendererInteractive,
      ),
      proofTotal: elapsed(processStartedAt, stoppedAt),
    },
  });
  exitAllowed = true;
  app.exit(0);
}

async function waitForRendererPaint(activeWindow: BrowserWindow): Promise<void> {
  await activeWindow.webContents.executeJavaScript(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    true,
  );
}

async function captureProofScreenshot(
  activeWindow: BrowserWindow,
  path: string,
): Promise<{
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly scaleFactor: number;
  readonly bytes: number;
  readonly nonBlank: boolean;
}> {
  const screenshot = await activeWindow.webContents.capturePage();
  const png = screenshot.toPNG();
  const bitmap = screenshot.toBitmap();
  const size = screenshot.getSize();
  const contentSize = activeWindow.getContentSize();
  const contentWidth = contentSize[0] ?? 0;
  const contentHeight = contentSize[1] ?? 0;
  if (contentWidth <= 0 || contentHeight <= 0) {
    throw new Error("desktop Assistant content size is invalid");
  }
  const evidence = {
    contentWidth,
    contentHeight,
    pixelWidth: size.width,
    pixelHeight: size.height,
    scaleFactor: round(size.width / contentWidth),
    bytes: png.byteLength,
    nonBlank: hasVisiblePixelVariation(bitmap),
  };
  if (!evidence.nonBlank) {
    throw new Error("desktop Assistant screenshot is blank");
  }
  await writeFile(path, png);
  return evidence;
}

async function shutdown(code: number): Promise<void> {
  exitCode = code;
  try {
    await lifecycle.close();
  } finally {
    exitAllowed = true;
    app.exit(code);
  }
}

async function removeProofProviders(): Promise<void> {
  const activeAssistant = assistant;
  if (activeAssistant === undefined) {
    throw new Error("desktop proof Assistant is missing during cleanup");
  }
  const configured = await activeAssistant.providers.listProviders();
  for (const provider of configured.providers) {
    await activeAssistant.providers.removeProvider({
      connectionId: provider.connectionId,
    });
  }
}

function requiredProofValue(
  value: string | undefined,
  label: string,
): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`desktop proof ${label} is required`);
  }
  return value;
}

async function writeProofReceipt(value: unknown): Promise<void> {
  if (proofReceiptPath === undefined) return;
  await writeFile(
    proofReceiptPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function elapsed(start: number, end: number): number {
  return round(end - start);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasVisiblePixelVariation(bitmap: Buffer): boolean {
  if (bitmap.byteLength < 8) return false;
  const first = bitmap.subarray(0, 4);
  for (let offset = 4; offset + 3 < bitmap.byteLength; offset += 4) {
    if (
      bitmap[offset] !== first[0] ||
      bitmap[offset + 1] !== first[1] ||
      bitmap[offset + 2] !== first[2] ||
      bitmap[offset + 3] !== first[3]
    ) {
      return true;
    }
  }
  return false;
}
