import { describe, expect, it } from "vitest"
import {
  extractModuleSpecifiers,
  findArtifactFileFailures,
  findCompiledModuleFailures
} from "./artifact-policy.mjs"

describe("compiled SDK artifact policy", () => {
  it("extracts static, side-effect, re-export, and dynamic imports", () => {
    expect(extractModuleSpecifiers(`
      import "node:fs"
      import { value } from "@wanex/storage"
      export type { Item } from "@wanex/runtime/tools"
      const lazy = import("yaml")
    `)).toEqual([
      "@wanex/runtime/tools",
      "@wanex/storage",
      "node:fs",
      "yaml"
    ])
  })

  it("rejects protocol, undeclared dependencies, and workspace paths", () => {
    expect(findCompiledModuleFailures({
      packageName: "@wanex/runtime",
      dependencies: { "@wanex/storage": "0.0.0" },
      workspaceRoot: "/workspace/wanex",
      content: `
        import type { JsonValue } from "@wanex/protocol"
        import { storage } from "@wanex/storage"
        import thing from "missing-package"
        // /workspace/wanex/packages/runtime/src/index.ts
      `
    }).map((failure) => failure.code)).toEqual([
      "artifact-absolute-path",
      "artifact-source-path",
      "artifact-protocol-import",
      "artifact-undeclared-import"
    ])
  })

  it("requires only compiled entry files", () => {
    expect(findArtifactFileFailures([
      "package.json",
      "README.md",
      "dist/index.js",
      "dist/index.d.ts",
      "src/index.ts"
    ], {
      entries: [{ artifactPath: "index" }]
    })).toEqual([
      expect.objectContaining({ code: "artifact-file-extra", path: "src/index.ts" }),
      expect.objectContaining({ code: "artifact-source-leak", path: "src/index.ts" })
    ])
  })
})
