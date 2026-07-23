import { describe, expect, it } from "vitest"
import { createEvalHarnessStep } from "./run-eval-harness.mjs"

describe("run-eval-harness", () => {
  it("uses Cargo's exact Windows executable name", () => {
    expect(createEvalHarnessStep(["--", "--only", "focused"], "win32"))
      .toMatchObject({
        command: "pnpm",
        args: [
          "--filter",
          "@wanex/eval-harness",
          "eval",
          "--",
          "--service-bin",
          "../../target/debug/wanex-system-service.exe",
          "--plugin-host-fixture",
          "../plugin/test/fixtures/plugin-host-fixture.mjs",
          "--only",
          "focused"
        ]
      })
  })

  it("uses the extensionless Cargo binary on Unix hosts", () => {
    expect(createEvalHarnessStep([], "linux").args).toContain(
      "../../target/debug/wanex-system-service"
    )
  })
})
