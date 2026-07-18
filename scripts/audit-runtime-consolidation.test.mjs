import { describe, expect, it } from "vitest"
import {
  findRuntimeConsolidationFailures,
  removedRuntimePackages
} from "./audit/runtime-consolidation-policy.mjs"

describe("Runtime consolidation policy", () => {
  it("accepts one retained Runtime with no old identities or upper dependencies", () => {
    expect(findRuntimeConsolidationFailures({
      manifests: [{
        name: "@wanex/runtime",
        path: "packages/runtime/package.json",
        manifest: { dependencies: { "@wanex/storage": "workspace:*" } }
      }],
      sources: [{ path: "packages/runtime/src/index.ts", text: "export {}" }]
    })).toEqual([])
  })

  it("rejects old manifests, old specifiers, and upper Runtime dependencies", () => {
    const removed = removedRuntimePackages[0]
    expect(findRuntimeConsolidationFailures({
      manifests: [
        { name: removed, path: "packages/old/package.json", manifest: {} },
        {
          name: "@wanex/runtime",
          path: "packages/runtime/package.json",
          manifest: { dependencies: { "@wanex/app": "workspace:*" } }
        }
      ],
      sources: [{ path: "apps/consumer.ts", text: `import ${JSON.stringify(removed)}` }]
    }).map((failure) => failure.code)).toEqual([
      "scheduled-runtime-package-remains",
      "removed-runtime-specifier-remains",
      "runtime-forbidden-dependency"
    ])
  })
})
