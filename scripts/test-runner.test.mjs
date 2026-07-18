import { describe, expect, it } from "vitest"
import { createPackageTestSteps } from "./run-package-test.mjs"
import { createWorkspaceTestSteps } from "./test.mjs"

describe("workspace test runner", () => {
  it("builds the system-service once before recursive package tests", () => {
    const steps = createWorkspaceTestSteps()

    expect(steps).toEqual([
      {
        name: "System service binary",
        command: "cargo",
        args: ["build", "-p", "wanex-system-service"]
      },
      {
        name: "Package tests",
        command: "pnpm",
        args: [
          "-r",
          "--if-present",
          "--workspace-concurrency=1",
          "test"
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
      "-r",
      "--if-present",
      "--workspace-concurrency=1",
      "test",
      "--maxWorkers=1",
      "--runInBand"
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
