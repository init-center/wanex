import { describe, expect, it } from "vitest"
import {
  parseFixtureReceipt,
  validateExternalFixtureManifest
} from "./fixture-policy.mjs"

const fixture = {
  id: "minimal-agent",
  dependencies: ["@wanex/runtime"]
}

describe("external consumer fixture policy", () => {
  it("accepts only exact frozen Wanex dependencies", () => {
    expect(validateExternalFixtureManifest(fixture, {
      name: "wanex-external-minimal-agent",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies: { "@wanex/runtime": "0.0.0" }
    })).toEqual([])
    expect(validateExternalFixtureManifest(fixture, {
      name: "wanex-external-minimal-agent",
      private: true,
      type: "module",
      dependencies: {
        "@wanex/runtime": "workspace:*",
        "@wanex/storage": "file:../storage.tgz"
      }
    })).toEqual([
      "dependencies must be exactly @wanex/runtime",
      "dependency @wanex/runtime must use an exact version",
      "dependency @wanex/storage must use an exact version"
    ])
  })

  it("requires one successful JSON receipt", () => {
    expect(parseFixtureReceipt(
      '{"id":"minimal-agent","ok":true,"assistantText":"done"}',
      "minimal-agent"
    )).toMatchObject({ ok: true, assistantText: "done" })
    expect(() => parseFixtureReceipt("not-json", "minimal-agent")).toThrow(
      "did not emit one JSON receipt"
    )
  })
})
