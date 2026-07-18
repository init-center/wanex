import { execFile } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const auditScriptPath = join(rootDir, "scripts/audit-package-packlist.mjs")
const fixtureDir = join(rootDir, "scripts/__audit_package_packlist_fixture")

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true })
})

describe("audit-package-packlist", () => {
  it("passes for the committed workspace package manifests", async () => {
    const result = await runAudit()

    expect(result.code).toBe(0)
    expect(result.report.failures).toEqual([])
  })

  it("rejects package entries that point at generated output", async () => {
    await mkdir(join(fixtureDir, "src"), { recursive: true })
    await writeFile(join(fixtureDir, "src/index.ts"), "export {}\n", "utf8")
    await writeFile(
      join(fixtureDir, "package.json"),
      JSON.stringify(
        {
          name: "@wanex/audit-packlist-fixture",
          exports: {
            ".": "./dist/index.js"
          },
          bin: {
            fixture: "./dist/cli.js"
          },
          types: "./dist/index.d.ts"
        },
        null,
        2
      ),
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(result.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "non-source-first-package-entry",
          entryKind: "exports",
          target: "./dist/index.js"
        }),
        expect.objectContaining({
          code: "non-typescript-source-package-entry",
          entryKind: "bin",
          target: "./dist/cli.js"
        }),
        expect.objectContaining({
          code: "forbidden-source-first-manifest-field",
          field: "types"
        })
      ])
    )
  })
})

async function runAudit() {
  try {
    const result = await execFileAsync(
      process.execPath,
      [auditScriptPath, "--json"],
      { cwd: rootDir }
    )
    return {
      code: 0,
      report: JSON.parse(result.stdout)
    }
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      report: JSON.parse(error.stdout)
    }
  }
}
