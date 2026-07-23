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
      })
})

console.log(JSON.stringify(result, null, 2))
