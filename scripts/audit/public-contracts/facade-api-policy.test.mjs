import { describe, expect, it } from "vitest"
import { findFacadeApiViolations } from "./facade-api-policy.mjs"

describe("facade public API policy", () => {
  it("accepts local explicit facade exports", () => {
    expect(findFacadeApiViolations({
      packageName: "@wanex/runtime",
      rootSource: 'export { createWanexRuntime } from "./runtime.js"\nexport type { WanexRuntime } from "./types.js"',
      typeSource: "export interface WanexRuntime { dispose(): Promise<void> }"
    })).toEqual([])
  })

  it("rejects wildcard exports and internal public type aliases", () => {
    expect(findFacadeApiViolations({
      packageName: "@wanex/app",
      rootSource: 'export * from "@wanex/storage"',
      typeSource: 'import type { StorageClient } from "@wanex/storage"'
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "facade-wildcard-export" }),
      expect.objectContaining({ code: "facade-forbidden-root-module" }),
      expect.objectContaining({ code: "facade-internal-type-import" })
    ]))
  })
})
