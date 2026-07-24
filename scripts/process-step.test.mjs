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

  it("runs the pnpm PowerShell shim with an argument array on Windows", () => {
    expect(
      resolveStepCommand(
        {
          command: "pnpm",
          args: ["--filter", "@wanex/runtime", "test", "value & echo unsafe"]
        },
        {
          env: {
            PNPM_HOME: "D:\\setup-pnpm\\node_modules\\.bin",
            SystemRoot: "C:\\Windows"
          },
          fileExists: (path) =>
            path ===
            "D:\\setup-pnpm\\node_modules\\.bin\\bin\\pnpm.ps1",
          platform: "win32"
        }
      )
    ).toEqual({
      command:
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "D:\\setup-pnpm\\node_modules\\.bin\\bin\\pnpm.ps1",
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

  it("fails closed when no Windows pnpm entry is available", () => {
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
      "Windows repository scripts require a pnpm JavaScript CLI or pnpm.ps1 shim"
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
    ).toThrow(/pnpm JavaScript CLI or pnpm\.ps1 shim/)
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
