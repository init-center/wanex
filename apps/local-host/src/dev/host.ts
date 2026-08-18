import { rm } from "node:fs/promises"
import type {
  Shell
} from "@wanex/product"
import type {
  WebNodeHostServer
} from "../web-host/types.js"
import {
  startLocalWebApp,
  type LocalWebApp
} from "../index.js"
import {
  ensureLocalDemoStoreDir,
  type LocalDemoOptions
} from "./options.js"

export interface LocalDemoHost {
  readonly app: Shell
  readonly host: WebNodeHostServer
  readonly url: string
  readonly storeDir: string
  readonly serviceBin: string
  readonly seed: boolean
  readonly sessionId?: string
  close(): Promise<void>
}

export async function startLocalDemoHost(
  options: LocalDemoOptions
): Promise<LocalDemoHost> {
  const storeDir = await ensureLocalDemoStoreDir(options.storeDir)
  const cleanupDir = options.storeDir === undefined ? storeDir : undefined
  const localApp = await startLocalWebApp({
    storage: {
      kind: "store-dir",
      storeDir
    },
    serviceBin: options.serviceBin,
    modelEndpoints: {
      endpoints: [
        {
          id: "web-demo",
          connection: {
            id: "web-demo",
            providerId: "fake"
          },
          protocol: { id: "fake" },
          model: {
            id: "web-demo-model",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: [],
            catalog: {
              source: "builtin",
              catalogId: "wanex.web-demo",
              revision: "1"
            }
          }
        }
      ]
    },
    web: {
      hostname: options.hostname,
      ...(options.port === undefined ? {} : { port: options.port })
    }
  })

  try {
    if (options.seed) {
      const submitted = await localApp.shell.submitConversationOperation({
        text: options.seedText,
        sessionId: options.sessionId
      })
      if (submitted.kind !== "product.conversation-operation.found") {
        throw new Error(
          `seeded local host demo failed to submit conversation: ${submitted.message}`
        )
      }
      await waitForSeedConversation(localApp.shell, options.sessionId)

      const opened = await localApp.controller.dispatchAction({
          type: "open-workbench",
          input: {
            sessionId: options.sessionId
          }
        })
      if (!opened.ok) {
        throw new Error("seeded local host demo failed to open workbench")
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

async function waitForSeedConversation(
  app: Shell,
  sessionId: string
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "product.conversation-operation.found" &&
      result.operation.capabilities.terminal
    ) {
      if (result.operation.state !== "succeeded") {
        throw new Error(
          `seeded local host demo conversation ended as ${result.operation.state}`
        )
      }
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("seeded local host demo conversation did not finish")
}

function demoHostHandle(request: {
  readonly localApp: LocalWebApp
  readonly storeDir: string
  readonly cleanupDir: string | undefined
  readonly options: LocalDemoOptions
}): LocalDemoHost {
  return {
    app: request.localApp.shell,
    host: request.localApp.host,
    url: request.localApp.url,
    storeDir: request.storeDir,
    serviceBin: request.options.serviceBin,
    seed: request.options.seed,
    ...(request.options.seed ? { sessionId: request.options.sessionId } : {}),
    async close() {
      await request.localApp.close()
      if (request.cleanupDir !== undefined) {
        await rm(request.cleanupDir, { recursive: true, force: true })
      }
    }
  }
}
