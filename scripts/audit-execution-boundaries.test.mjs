import { describe, expect, it } from "vitest"
import { findExecutionBoundaryViolations } from "./audit/execution-boundary-policy.mjs"

describe("execution boundary policy", () => {
  it("accepts reviewed control-plane owners and Scope-based task code", () => {
    expect(findExecutionBoundaryViolations([
      {
        path: "packages/runtime/src/execution/native-process.ts",
        text: 'import { spawn } from "node:child_process"'
      },
      {
        path: "apps/coding/src/host/start.ts",
        text: 'import { NativeExecutionEnvironment as Native } from "@wanex/runtime/execution"; new Native({})'
      },
      {
        path: "packages/workspace/src/tasks/run.ts",
        text: "export const run = (scope) => scope.fileSystem.read('/admitted')"
      },
      {
        path: "packages/runtime/src/secrets/providers.ts",
        text: "const source = process.env"
      }
    ])).toEqual([])
  })

  it("rejects direct child process imports outside reviewed owners", () => {
    expect(codes({
      path: "packages/plugin/src/rogue.ts",
      text: 'const child = await import("node:child_process")'
    })).toContain("unowned-child-process")
  })

  it("rejects direct filesystem imports in task execution sources", () => {
    expect(codes({
      path: "packages/workspace/src/tasks/rogue.ts",
      text: 'import { readFile } from "node:fs/promises"'
    })).toContain("direct-task-filesystem")
  })

  it("rejects Native environment construction outside composition roots", () => {
    expect(codes({
      path: "packages/plugin/src/rogue.ts",
      text: 'import { NativeExecutionEnvironment as Native } from "@wanex/runtime/execution"; new Native({})'
    })).toContain("unowned-native-environment-construction")
  })

  it("rejects ambient environment access outside reviewed owners", () => {
    for (const text of [
      "const value = process.env.TOKEN",
      'const value = process["env"].TOKEN',
      'import { env as ambient } from "node:process"',
      "const { env: ambient } = process"
    ]) {
      expect(codes({
        path: "packages/plugin/src/rogue.ts",
        text
      })).toContain("unowned-ambient-environment")
    }
  })

  it("does not mistake subprocess source embedded in a command string for Host I/O", () => {
    expect(findExecutionBoundaryViolations([{
      path: "packages/eval-harness/src/scenario.ts",
      text: "const script = `require('node:child_process').spawn('node')`"
    }])).toEqual([])
  })
})

function codes(source) {
  return findExecutionBoundaryViolations([source]).map((item) => item.code)
}
