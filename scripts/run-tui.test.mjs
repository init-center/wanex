import { describe, expect, it } from "vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createTuiDemoRun
} from "./run-tui.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/tui")
const serviceBin = join(
  rootDir,
  `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

describe("run-tui-demo", () => {
  it("runs TUI with a temporary store by default", async () => {
    const demo = await createTuiDemoRun({
      forwardedArgs: ["overview"],
      env: {},
      createTempRoot: async () => "/tmp/wanex-tui-demo-test"
    })

    expect(demo.cleanupDir).toBe("/tmp/wanex-tui-demo-test")
    expect(demo.step).toEqual({
      name: "TUI demo",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/cli/main.ts",
        "overview"
      ],
      env: {
        WANEX_STORE_DIR: "/tmp/wanex-tui-demo-test",
        WANEX_SYSTEM_SERVICE_BIN: serviceBin
      }
    })
  })

  it("honors an explicit store directory without cleaning it up", async () => {
    const demo = await createTuiDemoRun({
      forwardedArgs: ["overview", "--json"],
      env: {
        WANEX_STORE_DIR: "/tmp/wanex-tui-explicit",
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
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      "overview",
      "--json"
    ])
    expect(demo.step.env).toEqual({
      WANEX_STORE_DIR: "/tmp/wanex-tui-explicit",
      WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-service"
    })
  })

  it.each(["interactive", "fullscreen"])(
    "normalizes pnpm separators and forwards %s commands",
    async (command) => {
    const demo = await createTuiDemoRun({
      forwardedArgs: ["--", command],
      env: {
        WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-system-service"
      },
      createTempRoot: async () => `/tmp/wanex-tui-${command}`
    })

    expect(demo.cleanupDir).toBe(`/tmp/wanex-tui-${command}`)
    expect(demo.step.args).toEqual([
      "--silent",
      "--dir",
      appDir,
      "exec",
      "tsx",
      "./src/cli/main.ts",
      command
    ])
    expect(demo.step.env).toEqual({
      WANEX_STORE_DIR: `/tmp/wanex-tui-${command}`,
      WANEX_SYSTEM_SERVICE_BIN: "/tmp/wanex-system-service"
    })
    }
  )
})
