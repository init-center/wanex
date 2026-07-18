import { describe, expect, it } from "vitest"
import { findStorageRpcOwnershipViolations } from "./audit/storage-rpc-ownership/ownership-policy.mjs"

const ownership = {
  schemaVersion: 1,
  domains: {
    runtime: {
      classification: "core",
      owner: "@wanex/runtime",
      typescriptFiles: ["client-runtime.ts"],
      commands: ["doctor"]
    }
  }
}

describe("storage RPC ownership policy", () => {
  it("accepts exact TypeScript, Rust, and owner parity", () => {
    expect(findStorageRpcOwnershipViolations({
      ownership,
      typescriptCommandsByFile: { "client-runtime.ts": ["doctor"] },
      rustCommands: ["doctor"]
    })).toEqual([])
  })

  it("rejects an unowned command on either language side", () => {
    const failures = findStorageRpcOwnershipViolations({
      ownership,
      typescriptCommandsByFile: { "client-runtime.ts": ["doctor", "new-command"] },
      rustCommands: ["doctor", "rust-only"]
    })
    expect(failures.map((item) => item.code)).toEqual(expect.arrayContaining([
      "unowned-typescript-rpc-command",
      "unowned-rust-rpc-command"
    ]))
  })
})
