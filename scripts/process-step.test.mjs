import { describe, expect, it } from "vitest"
import { resolveStepCommand } from "./process-step.mjs"

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

  it("runs pnpm through its CLI module on Windows without joining arguments", () => {
    expect(
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["--filter", "@wanex/runtime", "test", "value & echo unsafe"]
        },
        {
          env: {
            npm_execpath: "D:\\pnpm\\pnpm.cjs"
          },
          nodeExecutable: "D:\\node\\node.exe",
          platform: "win32"
        }
      )
    ).toEqual({
      command: "D:\\node\\node.exe",
      args: [
        "D:\\pnpm\\pnpm.cjs",
        "--filter",
        "@wanex/runtime",
        "test",
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
      "Windows repository scripts must run through pnpm so npm_execpath identifies the pnpm CLI"
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
