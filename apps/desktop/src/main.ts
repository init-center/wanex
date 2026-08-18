import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  app,
  BrowserWindow,
  dialog,
  type Event as ElectronEvent,
  type OpenDialogOptions,
} from "electron";
import {
  startLocalWebApp,
  localSecretNamespace,
  type LocalStorageConfig,
  type LocalWebApp,
} from "@wanex/local-host";
import { createWanexLocalKeychainSecretStoreFromBinding } from "@wanex/local-credential-store/binding";
import { resolveLocalSystemService } from "@wanex/local-host/system-service";
import {
  loadWanexDesktopCredentialBinding,
  resolveWanexDesktopCredentialArtifact,
  WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE,
} from "./credential-artifact.js";
import { createWanexDesktopOwnedLifecycle } from "./lifecycle.js";
import {
  requiredWanexDesktopPackagedProofStep,
  runWanexDesktopNarrowVisualAccessibilityProof,
  runWanexDesktopNormalVisualAccessibilityProof,
  runWanexDesktopPackagedRendererProof,
  DesktopRendererProofError,
  DesktopVisualAccessibilityProofError,
} from "./packaged-renderer-proof.js";
import {
  isWanexDesktopOwnedNavigation,
  resolveWanexDesktopWindowChrome,
  type WanexDesktopWindowChromePolicy,
} from "./window-policy.js";
import {
  createDesktopExtensionComposition,
  createDesktopExtensionProofSelectionQueue,
  selectLocalExtensionDirectory,
} from "./extensions.js";

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

if (proofUserDataPath !== undefined) {
  app.setPath("userData", proofUserDataPath);
}
app.setName("Wanex");
app.setAppUserModelId("com.wanex.product.desktop");
app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>");

let product: LocalWebApp | undefined;
let window: BrowserWindow | undefined;
let exitAllowed = false;
let exitCode = 0;
let failurePhase = "electron_startup";
const lifecycle = createWanexDesktopOwnedLifecycle(async () => {
  window?.destroy();
  window = undefined;
  const ownedProduct = product;
  product = undefined;
  await ownedProduct?.close();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  installAppLifecycle();
  void start().catch(async (error: unknown) => {
    console.error(formatDesktopError(error));
    await writeProofReceipt({
      kind: "wanex.product-desktop.runtime-receipt",
      ok: false,
      failurePhase,
      ...(proofStep === undefined ? {} : { failureProofStep: proofStep }),
      ...(failurePhase === "renderer_proof"
        ? { failureDiagnostic: classifyRendererProofFailure(error) }
        : {}),
      error: boundedError(error),
      ...(error instanceof DesktopRendererProofError
        ? { renderer: error.renderer }
        : {}),
      ...(error instanceof DesktopVisualAccessibilityProofError
        ? { visualAccessibility: error.visualAccessibility }
        : {}),
    });
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
  const pluginComposition = createDesktopExtensionComposition({
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
  });
  failurePhase = "product_host_startup";
  product = await startLocalWebApp({
    storage,
    serviceBin: service.path,
    credentialStore,
    pluginComposition,
    web: {
      hostname: "127.0.0.1",
      port: 0,
      windowChrome: windowChrome.documentChrome,
    },
  });
  const hostReadyAt = performance.now();
  failurePhase = "renderer_load";
  window = createProductWindow(product.url, windowChrome);
  await window.loadURL(product.url);
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
      product !== undefined &&
      (window === undefined || window.isDestroyed())
    ) {
      window = createProductWindow(
        product.url,
        resolveWanexDesktopWindowChrome(process.platform),
      );
      void window.loadURL(product.url).then(() => window?.show());
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

function createProductWindow(
  productUrl: string,
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
    },
  });
  if (chrome.documentChrome === "integrated-macos") {
    created.on("page-title-updated", (event) => event.preventDefault());
  }
  const ownedOrigin = new URL(productUrl).origin;
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
  let visualAccessibility;
  let screenshots;
  if (step === "lifecycle") {
    failurePhase = "normal_visual_accessibility";
    activeWindow.setContentSize(1280, 748, false);
    const normal = await runWanexDesktopNormalVisualAccessibilityProof(
      activeWindow,
    );
    if (!normal.ok) {
      throw new DesktopVisualAccessibilityProofError({ normal });
    }
    failurePhase = "normal_screenshot";
    const normalScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(
        proofNormalScreenshotPath,
        "normal screenshot path",
      ),
    );

    failurePhase = "narrow_visual_accessibility";
    activeWindow.setContentSize(760, 748, false);
    const narrow = await runWanexDesktopNarrowVisualAccessibilityProof(
      activeWindow,
    );
    if (!narrow.ok) {
      throw new DesktopVisualAccessibilityProofError({ normal, narrow });
    }
    failurePhase = "narrow_screenshot";
    const narrowScreenshot = await captureProofScreenshot(
      activeWindow,
      requiredProofValue(
        proofNarrowScreenshotPath,
        "narrow screenshot path",
      ),
    );
    visualAccessibility = { normal, narrow };
    screenshots = { normal: normalScreenshot, narrow: narrowScreenshot };
  }
  failurePhase = "proof_cleanup";
  if (step === "lifecycle") await removeProofProviders();
  const shutdownStartedAt = performance.now();
  await lifecycle.close();
  const stoppedAt = performance.now();
  await writeProofReceipt({
    kind: "wanex.product-desktop.runtime-receipt",
    ok: true,
    proofStep: step,
    ...(timings.targetId === undefined ? {} : { target: timings.targetId }),
    renderer,
    ...(visualAccessibility === undefined
      ? {}
      : { visualAccessibility, screenshots }),
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
    throw new Error("desktop Product content size is invalid");
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
    throw new Error("desktop Product screenshot is blank");
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
  const activeProduct = product;
  if (activeProduct === undefined) {
    throw new Error("desktop proof Product is missing during cleanup");
  }
  const configured = await activeProduct.providers.listProviders();
  for (const provider of configured.providers) {
    await activeProduct.providers.removeProvider({
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

function boundedError(error: unknown): {
  readonly name: string;
  readonly code: string;
} {
  return {
    name: error instanceof Error ? error.name.slice(0, 128) : "UnknownError",
    code: readErrorCode(error).slice(0, 128),
  };
}

function classifyRendererProofFailure(error: unknown): string {
  if (error instanceof DesktopRendererProofError) {
    if ("failureStage" in error.renderer) {
      const stage = error.renderer.failureStage
      if (typeof stage === "string" && stage.length > 0) {
        return `renderer_${stage}`
      }
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  for (const stage of [
    "guided_follow_up_ready",
    "guided_parent_draft",
    "guided_parent_running",
    "guided_queue_mode",
    "guided_queue_draft",
    "guided_follow_up_pending",
    "guided_follow_up_settlement",
    "side_query_ready",
    "side_query_parent_draft",
    "side_query_parent_running",
    "side_query_workflows_open",
    "side_query_disclosure_open",
    "side_query_draft",
    "side_query_answer",
    "side_query_dismissal",
    "side_query_parent_settlement"
  ]) {
    const marker = `during ${stage}:`
    const index = message.indexOf(marker)
    if (index >= 0) {
      const detail = message.slice(index + marker.length).split("`")[0] ?? ""
      return detail.length > 0
        ? `${stage}_${detail}`.slice(0, 256)
        : `${stage}_timeout`
    }
    if (message.includes(`during ${stage}`)) return `${stage}_timeout`
  }
  if (message.includes("guided follow-up proof timed out during settlement")) {
    return "guided_follow_up_settlement_timeout"
  }
  if (message.includes("side-query proof timed out during parent settlement")) {
    return "side_query_parent_settlement_timeout"
  }
  const relaunchTimeout = message.match(
    /Provider relaunch proof timed out during [^:]+:([a-z_]+):([^`\n]*)/
  )
  if (relaunchTimeout !== null) {
    const stage = relaunchTimeout[1] ?? "renderer"
    const detail = relaunchTimeout[2] ?? "timeout"
    return `${stage}_${detail}`.slice(0, 256)
  }
  const teamTimeout = message.match(
    /Desktop Team proof timed out during ([a-z_]+)(?::([a-z0-9_-]+))?/
  )
  if (teamTimeout !== null) {
    return `team_${teamTimeout[1] ?? "renderer"}_${teamTimeout[2] ?? "timeout"}`
      .slice(0, 256)
  }
  for (const stage of [
    "chat_ready",
    "transcript_restore",
    "composer_ready",
    "conversation_settlement",
    "cancel_regenerate_ready",
    "cancel_available",
    "cancelled",
    "regenerated",
    "multimodal_ready",
    "unsupported_rejection",
    "attachment_picker",
    "attachment_preview",
    "attachment_remove_ready",
    "attachment_removal",
    "canonical_resource_preview",
    "image_generation_ready",
    "image_generation_settlement",
    "plan_ready",
    "plan_option",
    "plan_form",
    "plan_open",
    "plan_approval_ready",
    "plan_approved",
    "plan_execution_ready",
    "plan_execution",
    "goal_ready",
    "goal_option",
    "goal_form",
    "goal_started",
    "goal_terminal"
  ]) {
    const marker = `:${stage}`
    const index = message.indexOf(marker)
    if (index >= 0) {
      const detail =
        message.slice(index + marker.length + 1).split("`")[0] ?? ""
      return detail.length > 0 ? `${stage}_${detail}` : `${stage}_timeout`
    }
  }
  if (message.includes("timed out")) return "renderer_timeout"
  if (message.includes("conversation composer is unavailable")) {
    return "composer_unavailable"
  }
  if (message.includes("conversation was not submitted")) {
    return "conversation_not_submitted"
  }
  if (message.includes("image capability control is unavailable")) {
    return "image_capability_control_unavailable"
  }
  if (message.includes("attachment remove control is unavailable")) {
    return "attachment_remove_control_unavailable"
  }
  if (message.includes("DataTransfer")) return "data_transfer_failed"
  if (message.includes("File")) return "file_creation_failed"
  return "renderer_exception"
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "product_desktop_failed";
}

function formatDesktopError(error: unknown): string {
  const value = boundedError(error);
  return `[wanex-desktop] ${value.name}: ${value.code}`;
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
