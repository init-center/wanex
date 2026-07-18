import { rm } from "node:fs/promises"
import type {
  ProductAppShell
} from "@wanex/product-app"
import type {
  ProductAppWebNodeHostServer
} from "./web-host/types.js"
import {
  startProductAppLocalWebApp,
  type ProductAppLocalWebApp
} from "./index.js"
import {
  ensureProductAppLocalDemoStoreDir,
  type ProductAppLocalDemoOptions
} from "./demo-options.js"

export interface ProductAppLocalDemoHost {
  readonly app: ProductAppShell
  readonly host: ProductAppWebNodeHostServer
  readonly url: string
  readonly storeDir: string
  readonly serviceBin: string
  readonly seed: boolean
  readonly sessionId?: string
  readonly pollIntervalMs?: number
  close(): Promise<void>
}

export async function startProductAppLocalDemoHost(
  options: ProductAppLocalDemoOptions
): Promise<ProductAppLocalDemoHost> {
  const storeDir = await ensureProductAppLocalDemoStoreDir(options.storeDir)
  const cleanupDir = options.storeDir === undefined ? storeDir : undefined
  const localApp = await startProductAppLocalWebApp({
    storage: {
      kind: "store-dir",
      storeDir
    },
    serviceBin: options.serviceBin,
    providerProfiles: {
      profiles: [
        {
          id: "product-app-web-demo",
          modelId: "product-app-web-demo-model"
        }
      ]
    },
    web: {
      hostname: options.hostname,
      ...(options.port === undefined ? {} : { port: options.port }),
      ...(options.pollIntervalMs === undefined
        ? {}
        : { pollIntervalMs: options.pollIntervalMs })
    }
  })

  try {
    if (options.seed) {
      await localApp.productApp.dispatchProductCommand({
        command: "runAgentTurn",
        input: {
          text: options.seedText,
          sessionId: options.sessionId
        }
      })

      await localApp.productApp.selectSession({ sessionId: options.sessionId })

      const opened = await localApp.webController.submitActionInput(
        {
          action: "open-workbench",
          fields: {
            sessionId: options.sessionId
          }
        },
        {
          pollAfterAction: false
        }
      )
      if (!opened.ok) {
        throw new Error("seeded Product App Local demo failed to open workbench")
      }
    }

    return demoHostHandle({
      localApp,
      storeDir,
      cleanupDir,
      options
    })
  } catch (error) {
    await localApp.close()
    throw error
  }
}

function demoHostHandle(request: {
  readonly localApp: ProductAppLocalWebApp
  readonly storeDir: string
  readonly cleanupDir: string | undefined
  readonly options: ProductAppLocalDemoOptions
}): ProductAppLocalDemoHost {
  return {
    app: request.localApp.productApp,
    host: request.localApp.host,
    url: request.localApp.url,
    storeDir: request.storeDir,
    serviceBin: request.options.serviceBin,
    seed: request.options.seed,
    ...(request.options.seed ? { sessionId: request.options.sessionId } : {}),
    ...(request.options.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: request.options.pollIntervalMs }),
    async close() {
      await request.localApp.close()
      if (request.cleanupDir !== undefined) {
        await rm(request.cleanupDir, { recursive: true, force: true })
      }
    }
  }
}
