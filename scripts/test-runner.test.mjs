import { describe, expect, it } from "vitest"
import { createPackageTestSteps } from "./run-package-test.mjs"
import {
  createWorkspaceTestSteps,
  parseWorkspaceTestConcurrency
} from "./test.mjs"

describe("workspace test runner", () => {
  it("builds once, isolates native packages, and bounds the parallel package lane", () => {
    const steps = createWorkspaceTestSteps()

    expect(steps).toEqual([
      {
        name: "System service binary",
        command: "cargo",
        args: ["build", "-p", "wanex-system-service"]
      },
      {
        name: "Runtime package tests",
        command: "pnpm",
        args: [
          "--filter",
          "@wanex/runtime",
          "test"
        ],
        env: {
          WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
        }
      },
      {
        name: "Assistant Host package tests",
        command: "pnpm",
        args: [
          "--filter",
          "@wanex/assistant-host",
          "test",
          "--maxWorkers=1"
        ],
        env: {
          WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
        }
      },
      {
        name: "Parallel package tests",
        command: "pnpm",
        args: [
          "-r",
          "--filter",
          "!@wanex/runtime",
          "--filter",
          "!@wanex/assistant-host",
          "--if-present",
          "--workspace-concurrency=2",
          "test",
          "--maxWorkers=1"
        ],
        env: {
          WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
        }
      }
    ])
  })

  it("forwards Vitest args to recursive package tests", () => {
    const steps = createWorkspaceTestSteps({
      vitestArgs: ["--maxWorkers=1", "--runInBand"]
    })

    expect(steps[1].args).toEqual([
      "--filter",
      "@wanex/runtime",
      "test",
      "--maxWorkers=1",
      "--runInBand"
    ])
    expect(steps[2].args).toEqual([
      "--filter",
      "@wanex/assistant-host",
      "test",
      "--maxWorkers=1",
      "--runInBand"
    ])
    expect(steps[3].args).toEqual([
      "-r",
      "--filter",
      "!@wanex/runtime",
      "--filter",
      "!@wanex/assistant-host",
      "--if-present",
      "--workspace-concurrency=2",
      "test",
      "--maxWorkers=1",
      "--runInBand"
    ])
  })

  it("supports an explicit package concurrency budget", () => {
    const steps = createWorkspaceTestSteps({ workspaceConcurrency: 4 })

    expect(steps[3].args).toContain("--workspace-concurrency=4")
  })

  it("parses and validates the environment concurrency override", () => {
    expect(parseWorkspaceTestConcurrency(undefined)).toBe(2)
    expect(parseWorkspaceTestConcurrency("")).toBe(2)
    expect(parseWorkspaceTestConcurrency("3")).toBe(3)
    expect(() => parseWorkspaceTestConcurrency("0")).toThrow(
      "WANEX_TEST_CONCURRENCY must be a positive integer"
    )
    expect(() => parseWorkspaceTestConcurrency("2.5")).toThrow(
      "WANEX_TEST_CONCURRENCY must be a positive integer"
    )
  })

  it("forwards an explicit package worker budget without adding its own", () => {
    const steps = createWorkspaceTestSteps({
      vitestArgs: ["--maxWorkers", "3"]
    })

    expect(steps[1].args).toEqual([
      "--filter",
      "@wanex/runtime",
      "test",
      "--maxWorkers",
      "3"
    ])
    expect(steps[2].args).toEqual([
      "--filter",
      "@wanex/assistant-host",
      "test",
      "--maxWorkers",
      "3"
    ])
    expect(steps[3].args).toEqual([
      "-r",
      "--filter",
      "!@wanex/runtime",
      "--filter",
      "!@wanex/assistant-host",
      "--if-present",
      "--workspace-concurrency=2",
      "test",
      "--maxWorkers",
      "3"
    ])
  })
})
describe("package test runner", () => {
  it("keeps direct package tests self-sufficient", () => {
    expect(createPackageTestSteps()).toEqual([
      {
        name: "System service binary",
        command: "cargo",
        args: ["build", "-p", "wanex-system-service"]
      },
      {
        name: "Package Vitest",
        command: "vitest",
        args: ["run"]
      }
    ])
  })

  it("skips repeated builds when the workspace runner prepared the binary", () => {
    expect(
      createPackageTestSteps({
        skipSystemServiceBuild: true,
        vitestArgs: ["--maxWorkers=1"]
      })
    ).toEqual([
      {
        name: "Package Vitest",
        command: "vitest",
        args: ["run", "--maxWorkers=1"]
      }
    ])
  })
})
