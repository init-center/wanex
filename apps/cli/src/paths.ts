import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export function defaultServiceBin(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return join(currentDir, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
}
