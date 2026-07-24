import { execFile } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const auditScriptPath = join(rootDir, "scripts/audit-workspace-hygiene.mjs")
const fixtureDir = join(rootDir, "scripts/__audit_workspace_hygiene_fixture")

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true })
})

describe("audit-workspace-hygiene", () => {
  it("passes for the committed workspace tree", async () => {
    const result = await runAudit()

    expect(result.code).toBe(0)
    expect(result.report.failures).toEqual([])
  })

  it("rejects generated directories and OS metadata files", async () => {
    await mkdir(join(fixtureDir, "dist"), { recursive: true })
    await writeFile(join(fixtureDir, "dist/index.js"), "export {}\n", "utf8")
    await writeFile(join(fixtureDir, ".DS_Store"), "fixture\n", "utf8")
    await writeFile(
      join(fixtureDir, "package.json"),
      JSON.stringify(
        {
          name: "@wanex/audit-hygiene-fixture",
          scripts: {
            build: "tsc"
          }
        },
        null,
        2
      ),
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(failureCodes(result.report)).toEqual(
      expect.arrayContaining([
        "forbidden-emitting-tsc-build-script",
        "forbidden-generated-directory",
        "forbidden-os-metadata-file"
      ])
    )
  })

  it("rejects TypeScript configs that imply package-local emit", async () => {
    await mkdir(fixtureDir, { recursive: true })
    await writeFile(
      join(fixtureDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            rootDir: "src",
            outDir: "dist",
            sourceMap: true
          }
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
          code: "forbidden-typescript-emit-option",
          option: "outDir",
          path: "scripts/__audit_workspace_hygiene_fixture/tsconfig.json"
        }),
        expect.objectContaining({
          code: "forbidden-typescript-emit-option",
          option: "sourceMap",
          path: "scripts/__audit_workspace_hygiene_fixture/tsconfig.json"
        })
      ])
    )
  })

  it("rejects manual ESM main-module detection", async () => {
    await mkdir(fixtureDir, { recursive: true })
    await writeFile(
      join(fixtureDir, "entry.mjs"),
      [
        ["if (import.meta.url === `file://${process.argv", "[1]}`) {"].join(""),
        "  console.log('ran')",
        "}",
        ""
      ].join("\n"),
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(result.report.failures).toContainEqual(
      expect.objectContaining({
        code: "forbidden-manual-main-module-detection",
        path: "scripts/__audit_workspace_hygiene_fixture/entry.mjs"
      })
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

function failureCodes(report) {
  return report.failures.map((failure) => failure.code).sort()
}
