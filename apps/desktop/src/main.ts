import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
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
import { wanexLocalCredentialPolicy } from "@wanex/local-credential-store";
import { resolveLocalSystemService } from "@wanex/assistant-host/system-service";
import {
  loadWanexDesktopCredentialBinding,
  resolveWanexDesktopCredentialArtifact,
  WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE,
} from "./credential-artifact.js";
import {
  closeWanexDesktopOwnedResources,
  createWanexDesktopOwnedLifecycle,
  shouldShutdownAfterWindowAllClosed,
} from "./lifecycle.js";
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
  createWanexDesktopNavigationPolicy,
  resolveWanexDesktopWindowChrome,
  type WanexDesktopNavigationPolicy,
  type WanexDesktopWindowChromePolicy,
} from "./window-policy.js";
import {
  createDesktopExtensionComposition,
  createDesktopExtensionProofComposition,
  createDesktopExtensionProofSelectionQueue,
  selectLocalExtensionDirectory,
} from "./extensions.js";
import {
  WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED,
  WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL,
} from "./proof-contract.js";
import { desktopRendererAssets } from "./renderer-assets.js";
import { waitForDesktopInteractive } from "./proof/startup.js";
import { createDesktopServerProfileCatalog } from "./server/profile-catalog.js";
import {
  createDesktopServerConnectionManager,
  type DesktopServerConnectionManager,
} from "./server/connection-manager.js";
import { installDesktopServerIpc } from "./server/ipc.js";
import {
  createDesktopAssistantLocationOwner,
  type DesktopAssistantLocationOwner,
} from "./assistant/owner.js";
import { installDesktopAssistantIpc } from "./assistant/ipc.js";
import {
  createDesktopAssistantResourceRelay,
  DESKTOP_RESOURCE_PROTOCOL_PRIVILEGES,
  installDesktopResourceProtocol,
} from "./assistant/resource-relay.js";
import { createDesktopServerResourceTransport } from "./server/resource-transport.js";
import { createDesktopServerAttachmentTransport } from "./server/attachment-transport.js";
import {
  acquireDesktopSingleInstanceLock,
  DesktopSingleInstanceLockUnavailableError,
} from "./instance-lock.js";

const processStartedAt = performance.now();
const proofReceiptPath = process.env.WANEX_DESKTOP_PROOF_RECEIPT;
const proofNormalScreenshotPath =
  process.env.WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT;
const proofNarrowScreenshotPath =
  process.env.WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT;
const proofUserDataPath = process.env.WANEX_DESKTOP_PROOF_USER_DATA;
const proofProfileId = process.env.WANEX_DESKTOP_PROOF_PROFILE_ID;
const proofProviderBaseUrl = process.env.WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL;
const proofProviderCredential =
  process.env.WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL;
const proofRemoteServerUrl = process.env.WANEX_DESKTOP_PROOF_REMOTE_SERVER_URL;
const proofRemoteProfileId = process.env.WANEX_DESKTOP_PROOF_REMOTE_PROFILE_ID;
const proofRemoteProfileName =
  process.env.WANEX_DESKTOP_PROOF_REMOTE_PROFILE_NAME;
const proofStep = process.env.WANEX_DESKTOP_PROOF_STEP;
const proofExtensionSelections =
  process.env.WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS;
const LOCAL_WORKSPACE_HOST_ID = "local-assistant";

if (proofUserDataPath !== undefined) {
  app.setPath("userData", proofUserDataPath);
}
app.setName("Wanex");
app.setAppUserModelId("com.wanex.assistant.desktop");
app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "wanex-resource",
    privileges: DESKTOP_RESOURCE_PROTOCOL_PRIVILEGES,
  },
]);

let assistant: AssistantWebApp | undefined;
let serverConnections: DesktopServerConnectionManager | undefined;
let assistantLocations: DesktopAssistantLocationOwner | undefined;
let removeServerIpc: (() => void) | undefined;
let removeAssistantIpc: (() => void) | undefined;
let removeResourceProtocol: (() => void) | undefined;
let window: BrowserWindow | undefined;
let windowNavigation: WanexDesktopNavigationPolicy | undefined;
let exitAllowed = false;
let exitCode = 0;
let failurePhase = "electron_startup";
const instanceLock = acquireDesktopSingleInstanceLock(app);
const lifecycle = createWanexDesktopOwnedLifecycle(async () => {
  try {
    window?.destroy();
    window = undefined;
    windowNavigation = undefined;
    removeResourceProtocol?.();
    removeResourceProtocol = undefined;
    removeAssistantIpc?.();
    removeAssistantIpc = undefined;
    const ownedServerConnections = serverConnections;
    serverConnections = undefined;
    const ownedAssistantLocations = assistantLocations;
    assistantLocations = undefined;
    removeServerIpc?.();
    removeServerIpc = undefined;
    const ownedAssistant = assistant;
    assistant = undefined;
    await closeWanexDesktopOwnedResources({
      ...(ownedServerConnections === undefined
        ? {}
        : {
            serverConnections: async () => {
              await ownedAssistantLocations?.close();
              await ownedServerConnections.close();
            },
          }),
      ...(ownedAssistant === undefined
        ? {}
        : { assistant: () => ownedAssistant.close() }),
    });
  } finally {
    instanceLock.release();
  }
});

if (!instanceLock.acquired) {
  if (proofReceiptPath === undefined) {
    app.quit();
  } else {
    void failProofBeforeStartup(
      new DesktopSingleInstanceLockUnavailableError(),
    );
  }
} else {
  installAppLifecycle();
  void start().catch(async (error: unknown) => {
    console.error(formatWanexDesktopError(error));
    const assistantDiagnostics = await readProofAssistantDiagnostics();
    await writeProofReceipt(
      createWanexDesktopProofFailureReceipt({
        error,
        failurePhase,
        ...(proofStep === undefined ? {} : { proofStep }),
        ...(assistantDiagnostics === undefined ? {} : { assistantDiagnostics }),
      }),
    );
    await shutdown(1);
  });
}

async function readProofAssistantDiagnostics(): Promise<unknown | undefined> {
  const activeAssistant = assistant;
  if (proofStep !== "lifecycle" || activeAssistant === undefined) {
    return undefined;
  }
  const observed = activeAssistant.controller.snapshot();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const refreshed = await Promise.race([
      activeAssistant.controller.refresh(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          reject(new Error("Assistant diagnostics timed out"));
        }, 2_000);
      }),
    ]);
    return { refreshState: "succeeded", observed, refreshed };
  } catch (error) {
    desktopProofDiagnostic("read-assistant-diagnostics", error);
    return {
      refreshState: timedOut ? "timed_out" : "failed",
      observed,
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function failProofBeforeStartup(error: Error): Promise<void> {
  console.error(formatWanexDesktopError(error));
  try {
    await writeProofReceipt(
      createWanexDesktopProofFailureReceipt({
        error,
        failurePhase: "single_instance_lock",
        ...(proofStep === undefined ? {} : { proofStep }),
      }),
    );
  } finally {
    app.exit(1);
  }
}

async function start(): Promise<void> {
  await app.whenReady();
  const windowChrome = resolveWanexDesktopWindowChrome(process.platform);
  const appReadyAt = performance.now();
  const createdWindow = createAssistantWindow(windowChrome);
  window = createdWindow.window;
  windowNavigation = createdWindow.navigation;
  const storage: LocalStorageConfig = {
    kind: "profile",
    rootDir: app.getPath("userData"),
    profileId:
      proofReceiptPath === undefined
        ? process.env.WANEX_DESKTOP_PROFILE_ID ?? "default"
        : requiredProofValue(proofProfileId, "profile ID"),
    mode: "persistent",
  };
  failurePhase = "startup_prerequisites";
  const prerequisitesStartedAt = performance.now();
  let artifactVerifiedAt = prerequisitesStartedAt;
  let credentialResolvedAt = prerequisitesStartedAt;
  const [service, credentialStore] = await Promise.all([
    resolveDesktopSystemService().then((resolved) => {
      artifactVerifiedAt = performance.now();
      return resolved;
    }),
    createDesktopCredentialStore(storage).then((resolved) => {
      credentialResolvedAt = performance.now();
      return resolved;
    }),
  ]);
  const prerequisitesReadyAt = performance.now();
  const proofSelection = createDesktopExtensionProofSelectionQueue({
    proofEnabled: proofReceiptPath !== undefined,
    serializedSelections: proofExtensionSelections,
  });
  const remoteProfileProofValues = [
    proofRemoteServerUrl,
    proofRemoteProfileId,
    proofRemoteProfileName,
  ];
  const remoteProofStep =
    proofStep === "relaunch-remote-assistant" ||
    proofStep === "relaunch-remote-assistant-restore" ||
    proofStep === "relaunch-remote-media" ||
    proofStep === "relaunch-remote-media-restore";
  if (remoteProfileProofValues.some((value) => value !== undefined) && !remoteProofStep) {
    throw new Error(
      "Desktop remote proof values are only valid for a remote proof step",
    );
  }
  if (
    remoteProofStep &&
    remoteProfileProofValues.some((value) => value === undefined)
  ) {
    throw new Error(
      "Desktop remote proof requires Server URL and Profile values",
    );
  }
  const pluginCompositionOptions = {
    userDataDir: app.getPath("userData"),
    selectLocalPackage:
      proofSelection ??
      (async () =>
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
  const pluginComposition =
    proofStep === "relaunch-plugin-install"
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
    browserAssets: desktopRendererAssets,
    storage,
    serviceBin: service.path,
    credentialStore,
    pluginComposition,
    workspace: { hostId: LOCAL_WORKSPACE_HOST_ID, selectDirectory: selectConversationFolder },
    web: {
      hostname: "127.0.0.1",
      port: 0,
      windowChrome: windowChrome.documentChrome,
    },
  });
  const serverCredentialPolicy = wanexLocalCredentialPolicy({
    namespace: localSecretNamespace(storage),
    scheme: credentialStore.scheme,
  });
  const serverProfiles = createDesktopServerProfileCatalog({
    configuration: assistant.configuration,
    credentialStore,
    credentialResolver: credentialStore,
    ownsCredentialRef: serverCredentialPolicy.ownsRef,
    createCredentialRef: ({ profileId, revisionId }) =>
      serverCredentialPolicy.createRef({
        connectionId: `server-profile:${profileId}`,
        revisionId,
      }),
  });
  await serverProfiles.reconcileCredentialRetirement();
  serverConnections = createDesktopServerConnectionManager({
    profiles: serverProfiles,
    clientId: "wanex-desktop",
  });
  const resourceTransport = createDesktopServerResourceTransport({
    profiles: serverProfiles,
  });
  const attachmentTransport = createDesktopServerAttachmentTransport({
    profiles: serverProfiles,
  });
  const resourceRelay = createDesktopAssistantResourceRelay({
    transport: resourceTransport,
  });
  removeResourceProtocol = installDesktopResourceProtocol(
    protocol,
    resourceRelay,
  );
  assistantLocations = createDesktopAssistantLocationOwner({
    connections: serverConnections,
    attachmentTransport,
    resourceRelay,
  });
  removeAssistantIpc = installDesktopAssistantIpc({
    ipcMain,
    owner: assistantLocations,
    getWindow: () => window,
  });
  removeServerIpc = installDesktopServerIpc({
    ipcMain,
    profiles: serverProfiles,
    connections: serverConnections,
    getWindow: () => window,
  });
  const hostReadyAt = performance.now();
  failurePhase = "renderer_navigation";
  windowNavigation.bindOwnedOrigin(assistant.url);
  await window.loadURL(assistant.url);
  const rendererReadyAt = performance.now();

  if (proofReceiptPath !== undefined) {
    failurePhase = "renderer_proof";
    await runPackagedProof({
      appReadyAt,
      prerequisitesStartedAt,
      artifactVerifiedAt,
      credentialResolvedAt,
      prerequisitesReadyAt,
      hostReadyAt,
      rendererReadyAt,
      ...(service.targetId === undefined ? {} : { targetId: service.targetId }),
    });
    return;
  }
  window.show();
}

function desktopProofDiagnostic(operation: string, error?: unknown): void {
  if (error === undefined) {
    console.error(`[wanex-desktop-proof] ${operation}`);
    return;
  }
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[wanex-desktop-proof] ${operation}: ${detail}`);
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
      const createdWindow = createAssistantWindow(
        resolveWanexDesktopWindowChrome(process.platform),
      );
      window = createdWindow.window;
      windowNavigation = createdWindow.navigation;
      windowNavigation.bindOwnedOrigin(assistant.url);
      void window.loadURL(assistant.url).then(() => window?.show());
    }
  });
  app.on("window-all-closed", () => {
    if (shouldShutdownAfterWindowAllClosed(process.platform, lifecycle.state)) {
      void shutdown(0);
    }
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

function createAssistantWindow(chrome: WanexDesktopWindowChromePolicy): {
  readonly window: BrowserWindow;
  readonly navigation: WanexDesktopNavigationPolicy;
} {
  const navigation = createWanexDesktopNavigationPolicy();
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
  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  created.webContents.on("will-navigate", (event, url) => {
    if (!navigation.allows(url)) event.preventDefault();
  });
  created.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  created.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  created.webContents.session.setPermissionCheckHandler(() => false);
  created.on("closed", () => {
    if (window === created) {
      window = undefined;
      windowNavigation = undefined;
    }
  });
  return { window: created, navigation };
}

/** Trusted native picker for folders the user adds to a conversation. */
async function selectConversationFolder(): Promise<string | undefined> {
  const owner = window;
  const options: OpenDialogOptions = {
    title: "Add folder to conversation",
    buttonLabel: "Add folder",
    properties: ["openDirectory", "dontAddToRecent"],
  };
  const result =
    owner === undefined || owner.isDestroyed()
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(owner, options);
  if (result.canceled || result.filePaths.length !== 1) return undefined;
  const selected = result.filePaths[0];
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

async function createDesktopCredentialStore(storage: LocalStorageConfig) {
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
  readonly prerequisitesStartedAt: number;
  readonly artifactVerifiedAt: number;
  readonly credentialResolvedAt: number;
  readonly prerequisitesReadyAt: number;
  readonly hostReadyAt: number;
  readonly rendererReadyAt: number;
  readonly targetId?: string;
}): Promise<void> {
  const activeWindow = window;
  if (activeWindow === undefined)
    throw new Error("desktop proof window is missing");
  activeWindow.show();
  const rendererStartupMs = (await activeWindow.webContents.executeJavaScript(
    `(${waitForDesktopInteractive.toString()})()`,
    true,
  )) as import("./proof/startup.js").DesktopRendererStartupTimings;
  const interactiveAt = performance.now();
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
    ...(proofRemoteServerUrl === undefined
      ? {}
      : { remoteServerUrl: proofRemoteServerUrl }),
    ...(step === "relaunch-remote-assistant" ||
    step === "relaunch-remote-assistant-restore" ||
    step === "relaunch-remote-media" ||
    step === "relaunch-remote-media-restore"
      ? { remoteCredential: WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL }
      : {}),
    ...(proofRemoteProfileId === undefined
      ? {}
      : { remoteProfileId: proofRemoteProfileId }),
    ...(proofRemoteProfileName === undefined
      ? {}
      : { remoteProfileName: proofRemoteProfileName }),
    ...(step === "relaunch-remote-media" ||
    step === "relaunch-remote-media-restore"
      ? {
          probeResourceCapability: async (url: string) => {
            const response = await activeWindow.webContents.session.fetch(url, {
              method: "HEAD",
              cache: "no-store",
            });
            return response.status;
          },
        }
      : {}),
  });
  if (!renderer.ok) throw new DesktopRendererProofError(renderer);
  process.stdout.write("WANEX_DESKTOP_PROOF_RENDERER_COMPLETED\n");
  let screenshots;
  if (step === "lifecycle") {
    failurePhase = "normal_screenshot";
    activeWindow.setContentSize(1280, 748, false);
    await waitForRendererPaint(activeWindow);
    const normalScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(proofNormalScreenshotPath, "normal screenshot path"),
    );

    failurePhase = "narrow_screenshot";
    activeWindow.setContentSize(760, 748, false);
    await waitForRendererPaint(activeWindow);
    const narrowScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(proofNarrowScreenshotPath, "narrow screenshot path"),
    );
    screenshots = { normal: normalScreenshot, narrow: narrowScreenshot };
  }
  failurePhase = "proof_cleanup";
  if (step === "lifecycle") await removeProofProviders();
  const shutdownStartedAt = performance.now();
  process.stdout.write("WANEX_DESKTOP_PROOF_SHUTDOWN_STARTED\n");
  await lifecycle.close();
  process.stdout.write("WANEX_DESKTOP_PROOF_SHUTDOWN_COMPLETED\n");
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
      windowInitialization: elapsed(
        timings.appReadyAt,
        timings.prerequisitesStartedAt,
      ),
      artifactVerification: elapsed(
        timings.prerequisitesStartedAt,
        timings.artifactVerifiedAt,
      ),
      credentialResolution: elapsed(
        timings.prerequisitesStartedAt,
        timings.credentialResolvedAt,
      ),
      startupPrerequisites: elapsed(
        timings.prerequisitesStartedAt,
        timings.prerequisitesReadyAt,
      ),
      hostStartup: elapsed(timings.prerequisitesReadyAt, timings.hostReadyAt),
      rendererNavigation: elapsed(
        timings.hostReadyAt,
        timings.rendererReadyAt,
      ),
      rendererInteractive: elapsed(timings.rendererReadyAt, interactiveAt),
      journeyPreparation: renderer.timingsMs.journeyPreparation,
      conversationSettlement: renderer.timingsMs.conversationSettlement,
      rendererPostSettlement: renderer.timingsMs.rendererPostSettlement,
      shutdown: elapsed(shutdownStartedAt, stoppedAt),
      interactiveTotal: elapsed(processStartedAt, interactiveAt),
      proofTotal: elapsed(processStartedAt, stoppedAt),
    },
    rendererStartupMs,
  });
  exitAllowed = true;
  app.exit(0);
}

async function waitForRendererPaint(
  activeWindow: BrowserWindow,
): Promise<void> {
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

function requiredProofValue(value: string | undefined, label: string): string {
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
