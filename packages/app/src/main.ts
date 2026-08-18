import { resolve } from "node:path"
import { runWanexAppSmoke } from "./smoke.js"

const defaultStoreDir = resolve(process.cwd(), ".wanex-app")

const result = await runWanexAppSmoke({
  storage: {
    kind: "local-system-service",
    storeDir: process.env.WANEX_STORE_DIR ?? defaultStoreDir
  },
  ...(process.env.WANEX_SYSTEM_SERVICE_BIN === undefined
    ? {}
    : {
        artifacts: {
          explicitPath: process.env.WANEX_SYSTEM_SERVICE_BIN
        }
    }),
  modelEndpoint: {
    id: "wanex-app-smoke",
    connection: { id: "wanex-app-smoke", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "wanex-app-smoke-model",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "wanex.app-smoke",
        revision: "1"
      }
    }
  }
})

console.log(JSON.stringify(result, null, 2))
