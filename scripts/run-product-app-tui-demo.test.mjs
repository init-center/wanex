import { describe, expect, it } from "vitest"
import {
  createProductAppTuiDemoRun
} from "./run-product-app-tui-demo.mjs"

describe("run-product-app-tui-demo", () => {
  it("runs Product App TUI with a temporary store by default", async () => {
    const demo = await createProductAppTuiDemoRun({
      forwardedArgs: ["overview"],
      env: {},
      createTempRoot: async () => "/tmp/wanex-product-app-tui-demo-test"
    })

    expect(demo.cleanupDir).toBe("/tmp/wanex-product-app-tui-demo-test")
    expect(demo.step).toEqual({
      name: "Product App TUI demo",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        expect.stringContaining("apps/product-app-tui"),
        "exec",
        "tsx",
        "./src/main.ts",
        "overview"
      ],
      env: {
        WANEX_STORE_DIR: "/tmp/wanex-product-app-tui-demo-test",
        WANEX_SYSTEM_SERVICE_BIN: expect.stringContaining(
          "target/debug/wanex-system-service"
        )
      }
    })
  })

  it("honors an explicit store directory without cleaning it up", async () => {
    const demo = await createProductAppTuiDemoRun({
      forwardedArgs: ["overview", "--json"],
      env: {
        WANEX_STORE_DIR: "/tmp/wanex-product-app-tui-explicit",
        WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-service"
      },
      createTempRoot: async () => {
        throw new Error("unexpected temp root")
      }
    })

    expect(demo.cleanupDir).toBeUndefined()
    expect(demo.step.args).toEqual([
      "--silent",
      "--dir",
      expect.stringContaining("apps/product-app-tui"),
      "exec",
      "tsx",
      "./src/main.ts",
      "overview",
      "--json"
    ])
    expect(demo.step.env).toEqual({
      WANEX_STORE_DIR: "/tmp/wanex-product-app-tui-explicit",
      WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-service"
    })
  })

  it("normalizes pnpm separators and forwards interactive commands", async () => {
    const demo = await createProductAppTuiDemoRun({
      forwardedArgs: ["--", "interactive"],
      env: {
        WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-system-service"
      },
      createTempRoot: async () => "/tmp/wanex-product-app-tui-interactive"
    })

    expect(demo.cleanupDir).toBe("/tmp/wanex-product-app-tui-interactive")
    expect(demo.step.args).toEqual([
      "--silent",
      "--dir",
      expect.stringContaining("apps/product-app-tui"),
      "exec",
      "tsx",
      "./src/main.ts",
      "interactive"
    ])
    expect(demo.step.env).toEqual({
      WANEX_STORE_DIR: "/tmp/wanex-product-app-tui-interactive",
      WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-system-service"
    })
  })
})
