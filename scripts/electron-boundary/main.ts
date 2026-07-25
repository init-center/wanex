import {
  app,
  BrowserWindow,
  ipcMain,
  session
} from "electron"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import {
  resolveSystemServiceBinary
} from "@wanex/runtime/bootstrap"
import {
  startProductAppDesktopMainHost,
  type ProductAppDesktopMainHost
} from "@wanex/product-app-local/desktop-host"
import {
  WANEX_DESKTOP_INVOKE_CHANNEL,
  type WanexElectronBoundaryRendererSmokeResult
} from "./contract.js"

const processStartedAt = performance.now()
const smokeReceiptPath = process.env.WANEX_ELECTRON_SMOKE_RECEIPT
const smokeUserData = process.env.WANEX_ELECTRON_SMOKE_USER_DATA
if (smokeUserData !== undefined) app.setPath("userData", smokeUserData)
let host: ProductAppDesktopMainHost | undefined
let window: BrowserWindow | undefined
let shuttingDown: Promise<void> | undefined

app.on("window-all-closed", () => {
  if (smokeReceiptPath === undefined) app.quit()
})

app.on("before-quit", (event) => {
  if (host === undefined || shuttingDown !== undefined) return
  event.preventDefault()
  void shutdown(0)
})

void start().catch(async (error: unknown) => {
  console.error(error)
  await writeSmokeReceipt({
    kind: "wanex.electron-boundary.runtime-receipt",
    ok: false,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      code: readErrorCode(error)
    }
  })
  await shutdown(1)
})

async function start(): Promise<void> {
  await app.whenReady()
  const appReadyAt = performance.now()
  installSessionPolicy()
  const nativeDir = join(process.resourcesPath, "native")
  const manifest = JSON.parse(await readFile(
    join(nativeDir, "runtime-artifacts.json"),
    "utf8"
  )) as unknown
  const verifyStartedAt = performance.now()
  const artifact = await resolveSystemServiceBinary({
    manifest,
    artifactDir: nativeDir,
    checkExecutable: process.platform !== "win32"
  })
  const artifactVerifiedAt = performance.now()
  host = await startProductAppDesktopMainHost({
    storage: {
      kind: "profile",
      rootDir: app.getPath("userData"),
      profileId: "electron-boundary",
      mode: "persistent"
    },
    serviceBin: artifact.path,
    providerProfiles: {
      profiles: [
        { id: "electron-primary", modelId: "electron-primary-model" },
        { id: "electron-secondary", modelId: "electron-secondary-model" }
      ],
      activeProfileId: "electron-primary"
    },
    web: { hostname: "127.0.0.1", port: 0, pollIntervalMs: 0 }
  })
  const hostReadyAt = performance.now()
  ipcMain.handle(WANEX_DESKTOP_INVOKE_CHANNEL, async (_event, request) =>
    await host!.handleRequest(request)
  )
  window = createWindow()
  await window.loadFile(join(__dirname, "renderer.html"))
  const rendererReadyAt = performance.now()

  if (smokeReceiptPath !== undefined) {
    const smoke = await window.webContents.executeJavaScript(
      "window.wanexBoundarySmoke()",
      true
    ) as WanexElectronBoundaryRendererSmokeResult
    if (!Object.values(smoke.checks).every((value) => value === true)) {
      throw new Error(`renderer smoke failed: ${JSON.stringify(smoke)}`)
    }
    assertRendererSmokeEvidence(smoke)
    const shutdownStartedAt = performance.now()
    await closeOwnedResources()
    const stoppedAt = performance.now()
    await writeSmokeReceipt({
      kind: "wanex.electron-boundary.runtime-receipt",
      ok: true,
      target: artifact.target,
      smoke: smoke.checks,
      conversation: smoke.conversation,
      privacy: {
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawIpc: false
      },
      timingsMs: {
        processToAppReady: elapsed(processStartedAt, appReadyAt),
        artifactVerification: elapsed(verifyStartedAt, artifactVerifiedAt),
        hostStartup: elapsed(artifactVerifiedAt, hostReadyAt),
        rendererLoad: elapsed(hostReadyAt, rendererReadyAt),
        rendererInteractive: smoke.timingsMs.rendererInteractive,
        conversationSettlement: smoke.timingsMs.conversationSettlement,
        rendererPostSettlement: smoke.timingsMs.rendererPostSettlement,
        shutdown: elapsed(shutdownStartedAt, stoppedAt),
        interactiveTotal: round(
          elapsed(processStartedAt, rendererReadyAt) +
            smoke.timingsMs.rendererInteractive
        ),
        proofTotal: elapsed(processStartedAt, stoppedAt)
      }
    })
    app.exit(0)
  } else {
    window.show()
  }
}

function createWindow(): BrowserWindow {
  const created = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  created.webContents.on("will-navigate", (event) => event.preventDefault())
  return created
}

function installSessionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown !== undefined) return await shuttingDown
  shuttingDown = (async () => {
    await closeOwnedResources()
    app.exit(exitCode)
  })()
  return await shuttingDown
}

async function closeOwnedResources(): Promise<void> {
  ipcMain.removeHandler(WANEX_DESKTOP_INVOKE_CHANNEL)
  window?.destroy()
  window = undefined
  const ownedHost = host
  host = undefined
  await ownedHost?.close()
}

async function writeSmokeReceipt(value: unknown): Promise<void> {
  if (smokeReceiptPath === undefined) return
  await writeFile(smokeReceiptPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function elapsed(start: number, end: number): number {
  return round(end - start)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function assertRendererSmokeEvidence(
  smoke: WanexElectronBoundaryRendererSmokeResult
): void {
  for (const [name, value] of Object.entries(smoke.timingsMs)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`renderer smoke ${name} timing is invalid`)
    }
  }
  if (
    smoke.conversation.sessionId.trim().length === 0 ||
    !Number.isSafeInteger(smoke.conversation.refreshCount) ||
    smoke.conversation.refreshCount < 0
  ) {
    throw new Error("renderer smoke conversation evidence is invalid")
  }
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }
  return "electron_boundary_failed"
}
