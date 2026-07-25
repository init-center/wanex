import { describe, expect, it } from "vitest"
import {
  resolvePackageBinary,
  resolveStepCommand
} from "./process-step.mjs"

describe("shell-free process steps", () => {
  it("runs Node steps through the current Node executable", () => {
    expect(
      resolveStepCommand(
        {
          command: "node",
          args: ["./scripts/example.mjs", "--value", "two words"]
        },
        {
          nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
          platform: "win32"
        }
      )
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["./scripts/example.mjs", "--value", "two words"]
    })
  })

  it("runs the pnpm v11 ESM CLI on Windows without joining arguments", () => {
    expect(
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["--filter", "@wanex/runtime", "test", "value & echo unsafe"]
        },
        {
          env: {
            npm_execpath:
              "C:\\Users\\runneradmin\\setup-pnpm\\node_modules\\.bin\\global\\v11\\install\\node_modules\\pnpm\\bin\\pnpm.mjs"
          },
          nodeExecutable: "D:\\node\\node.exe",
          platform: "win32"
        }
      )
    ).toEqual({
      command: "D:\\node\\node.exe",
      args: [
        "C:\\Users\\runneradmin\\setup-pnpm\\node_modules\\.bin\\global\\v11\\install\\node_modules\\pnpm\\bin\\pnpm.mjs",
        "--filter",
        "@wanex/runtime",
        "test",
        "value & echo unsafe"
      ]
    })
  })

  it("keeps the active workspace pnpm CLI outside the workspace on POSIX", () => {
    expect(
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["pack", "--json"]
        },
        {
          env: {
            npm_execpath: "/workspace/node_modules/pnpm/bin/pnpm.mjs"
          },
          nodeExecutable: "/node/bin/node",
          platform: "darwin"
        }
      )
    ).toEqual({
      command: "/node/bin/node",
      args: [
        "/workspace/node_modules/pnpm/bin/pnpm.mjs",
        "pack",
        "--json"
      ]
    })
  })

  it("runs the Node-bundled npm CLI on Windows without a command shim", () => {
    expect(
      resolveStepCommand(
        {
          command: "npm",
          args: ["install", "--ignore-scripts", "value & echo unsafe"]
        },
        {
          nodeExecutable: "D:\\node\\node.exe",
          npmCli: "D:\\node\\node_modules\\npm\\bin\\npm-cli.js",
          platform: "win32"
        }
      )
    ).toEqual({
      command: "D:\\node\\node.exe",
      args: [
        "D:\\node\\node_modules\\npm\\bin\\npm-cli.js",
        "install",
        "--ignore-scripts",
        "value & echo unsafe"
      ]
    })
  })

  it("runs Vitest through its package binary with the current Node", () => {
    expect(
      resolveStepCommand(
        {
          command: "vitest",
          args: ["run", "--maxWorkers=1"]
        },
        {
          nodeExecutable: "D:\\node\\node.exe",
          platform: "win32",
          vitestCli: "D:\\wanex\\node_modules\\vitest\\vitest.mjs"
        }
      )
    ).toEqual({
      command: "D:\\node\\node.exe",
      args: [
        "D:\\wanex\\node_modules\\vitest\\vitest.mjs",
        "run",
        "--maxWorkers=1"
      ]
    })
  })

  it("resolves package binaries when exports hide package.json", () => {
    expect(resolvePackageBinary("publint", "publint"))
      .toMatch(/[\\/]publint[\\/].+\.js$/)
  })

  it("fails closed when a Windows pnpm lifecycle is unavailable", () => {
    expect(() =>
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["verify"]
        },
        {
          env: {},
          platform: "win32"
        }
      )
    ).toThrow(
      "Windows repository scripts must run through pnpm so npm_execpath identifies its JavaScript CLI"
    )
  })

  it("does not accept an npm CLI as the Windows pnpm executable", () => {
    expect(() =>
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["verify"]
        },
        {
          env: {
            npm_execpath: "D:\\node\\node_modules\\npm\\bin\\npm-cli.js"
          },
          platform: "win32"
        }
      )
    ).toThrow(/npm_execpath/)
  })

  it("does not accept a pnpm CLI as the Windows npm executable", () => {
    expect(() =>
      resolveStepCommand(
        {
          command: "npm",
          args: ["install"]
        },
        {
          nodeExecutable: "D:\\node\\node.exe",
          npmCli: "D:\\node\\node_modules\\pnpm\\bin\\pnpm.mjs",
          platform: "win32"
        }
      )
    ).toThrow(/npm JavaScript CLI/)
  })

  it("launches native commands directly on every platform", () => {
    expect(
      resolveStepCommand(
        {
          command: "cargo",
          args: ["test", "--workspace"]
        },
        {
          platform: "win32"
        }
      )
    ).toEqual({
      command: "cargo",
      args: ["test", "--workspace"]
    })
  })
})
