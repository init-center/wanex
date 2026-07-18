import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createEvalScenario } from "../src/index.js"
import { runEvalCli } from "../src/cli-main.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const pluginHostFixture = join(
  import.meta.dirname,
  "../../plugin/test/fixtures/plugin-host-fixture.mjs"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("wanex-eval CLI", () => {
  it("runs selected scenarios and emits a JSON report", async () => {
    const storeDir = await tempStore()
    const result = await runEvalCli(
      [
        "--store",
        storeDir,
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture,
        "--only",
        "pass"
      ],
      {},
      [
        createEvalScenario({
          id: "pass",
          title: "Pass",
          run: () => ({ ok: true })
        }),
        createEvalScenario({
          id: "skip",
          title: "Skip",
          run: () => ({ skipped: false })
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const body = JSON.parse(result.stdout)
    expect(body).toMatchObject({
      ok: true,
      value: {
        totals: {
          passed: 1,
          failed: 0,
          skipped: 1
        }
      }
    })
    expect(body.value.results.map((item: { readonly id: string }) => item.id))
      .toEqual(["pass", "skip"])
  })

  it("returns exit code 1 when a selected scenario fails", async () => {
    const storeDir = await tempStore()
    const result = await runEvalCli(
      [
        "--store",
        storeDir,
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {},
      [
        createEvalScenario({
          id: "fail",
          title: "Fail",
          run: () => {
            throw new Error("planned cli failure")
          }
        })
      ]
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe("")
    const body = JSON.parse(result.stdout)
    expect(body).toMatchObject({
      ok: false,
      value: {
        totals: {
          passed: 0,
          failed: 1,
          skipped: 0
        }
      }
    })
    expect(body.value.results[0].error.message).toBe("planned cli failure")
  })

  it("runs all supplied scenarios by default", async () => {
    const storeDir = await tempStore()
    const result = await runEvalCli(
      [
        "--store",
        storeDir,
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {},
      [
        createEvalScenario({
          id: "first",
          title: "First",
          run: () => ({ order: 1 })
        }),
        createEvalScenario({
          id: "second",
          title: "Second",
          run: () => ({ order: 2 })
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const body = JSON.parse(result.stdout)
    expect(body.value.totals).toEqual({
      passed: 2,
      failed: 0,
      skipped: 0
    })
    expect(body.value.results.map((item: { readonly id: string }) => item.id))
      .toEqual(["first", "second"])
  })

  it("uses an isolated temporary store when no store is provided", async () => {
    const seenStores: string[] = []
    const result = await runEvalCli(
      [
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {},
      [
        createEvalScenario({
          id: "temp-store",
          title: "Temp Store",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { storeDir: context.storeDir }
          }
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(seenStores).toHaveLength(1)
    expect(seenStores[0]).toContain("wanex-eval-")
    expect(seenStores[0]).not.toContain(".wanex-eval")
  })

  it("isolates each default CLI scenario in its own store", async () => {
    const seenStores: string[] = []
    const result = await runEvalCli(
      [
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {},
      [
        createEvalScenario({
          id: "first-default-store",
          title: "First Default Store",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { storeDir: context.storeDir }
          }
        }),
        createEvalScenario({
          id: "second-default-store",
          title: "Second Default Store",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { storeDir: context.storeDir }
          }
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(seenStores).toHaveLength(2)
    expect(new Set(seenStores).size).toBe(2)
    const body = JSON.parse(result.stdout)
    expect(body.value.totals).toEqual({
      passed: 2,
      failed: 0,
      skipped: 0
    })
  })

  it("does not allocate a default store for skipped scenarios", async () => {
    const seenStores: string[] = []
    const result = await runEvalCli(
      [
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture,
        "--only",
        "run"
      ],
      {},
      [
        createEvalScenario({
          id: "skip",
          title: "Skip",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { shouldNotRun: true }
          }
        }),
        createEvalScenario({
          id: "run",
          title: "Run",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { ran: true }
          }
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(seenStores).toHaveLength(1)
    const body = JSON.parse(result.stdout)
    expect(body.value.totals).toEqual({
      passed: 1,
      failed: 0,
      skipped: 1
    })
    expect(body.value.results.map((item: { readonly id: string }) => item.id))
      .toEqual(["skip", "run"])
  })

  it("uses WANEX_EVAL_STORE_DIR when provided", async () => {
    const storeDir = await tempStore()
    const seenStores: string[] = []
    const result = await runEvalCli(
      [
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {
        WANEX_EVAL_STORE_DIR: storeDir
      },
      [
        createEvalScenario({
          id: "env-store-a",
          title: "Env Store A",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { storeDir: context.storeDir }
          }
        }),
        createEvalScenario({
          id: "env-store-b",
          title: "Env Store B",
          run: (context) => {
            seenStores.push(context.storeDir)
            return { storeDir: context.storeDir }
          }
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(seenStores).toEqual([storeDir, storeDir])
  })

  it("supports skip filtering", async () => {
    const storeDir = await tempStore()
    const result = await runEvalCli(
      [
        "--store",
        storeDir,
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture,
        "--skip",
        "skip"
      ],
      {},
      [
        createEvalScenario({
          id: "pass",
          title: "Pass",
          run: () => ({ ok: true })
        }),
        createEvalScenario({
          id: "skip",
          title: "Skip",
          run: () => ({ skipped: false })
        })
      ]
    )

    const body = JSON.parse(result.stdout)
    expect(result.exitCode).toBe(0)
    expect(body.value.totals).toEqual({
      passed: 1,
      failed: 0,
      skipped: 1
    })
  })

  it("accepts a leading pnpm argument separator", async () => {
    const storeDir = await tempStore()
    const result = await runEvalCli(
      [
        "--",
        "--store",
        storeDir,
        "--service-bin",
        serviceBin,
        "--plugin-host-fixture",
        pluginHostFixture
      ],
      {},
      [
        createEvalScenario({
          id: "pass",
          title: "Pass",
          run: () => ({ ok: true })
        })
      ]
    )

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout).value.totals.passed).toBe(1)
  })

  it("reports argument errors as JSON", async () => {
    const result = await runEvalCli(["--service-bin"], {}, [])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        message: "--service-bin requires a value"
      }
    })
  })

  it("prints JSON help", async () => {
    const result = await runEvalCli(["--help"], {}, [])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout).value).toContain("wanex-eval")
  })
})

async function tempStore(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-eval-cli-store-"))
  tempDirs.push(dir)
  return dir
}
