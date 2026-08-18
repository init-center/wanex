import { createHash } from "node:crypto"
import { resolve } from "node:path"

export function wanexLocalCredentialNamespace(storeDir: string): string {
  const location = resolve(storeDir)
  return createHash("sha256")
    .update("wanex.product.local.secret-store.v1\u0000")
    .update(location)
    .digest("hex")
}
