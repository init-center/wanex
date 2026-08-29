import { execFile } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { findManifestDependencyViolations } from "./audit/public-contracts/manifest-dependency-policy.mjs"
import { normalizeRepositoryPath } from "./audit/repository-path.mjs"

const execFileAsync = promisify(execFile)
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const auditScriptPath = join(rootDir, "scripts/audit-public-contracts.mjs")
const fixturePath = join(
  rootDir,
  "packages/protocol/src/__audit_deprecated_alias_fixture.ts"
)
const unreachableFixturePath = join(
  rootDir,
  "packages/protocol/src/__audit_unreachable_contract_fixture.ts"
)
const upperAppImportFixturePath = join(
  rootDir,
  "packages/storage/src/__audit_upper_app_import_fixture.ts"
)
const manifestDependencyFixtureDir = join(
  rootDir,
  "packages/__audit_manifest_dependency_fixture"
)
const manifestDependencyFixturePackagePath = join(
  manifestDependencyFixtureDir,
  "package.json"
)
const manifestDependencyFixtureSourceDir = join(
  manifestDependencyFixtureDir,
  "src"
)
const manifestDependencyFixtureSourcePath = join(
  manifestDependencyFixtureSourceDir,
  "index.ts"
)
const manifestDependencyFixtureReadmePath = join(
  manifestDependencyFixtureDir,
  "README.md"
)
afterEach(async () => {
  await Promise.all([
    rm(fixturePath, { force: true }),
    rm(unreachableFixturePath, { force: true }),
    rm(upperAppImportFixturePath, { force: true }),
    rm(manifestDependencyFixtureDir, { recursive: true, force: true })
  ])
})

describe("audit-public-contracts", () => {
  it("serializes repository paths independently of host separators", () => {
    expect(normalizeRepositoryPath("packages\\runtime\\src\\index.ts"))
      .toBe("packages/runtime/src/index.ts")
  })

  it("passes for the committed public contracts", async () => {
    const result = await runAudit()
    expect(result.code).toBe(0)
    expect(result.report.failures).toEqual([])
  })

  it("rejects forbidden protocol source contracts", async () => {
    await writeFile(
      fixturePath,
      `export interface UiSurfaceMessagePart {
  readonly type: "ui_surface"
}

export interface QueryEventsInput {
  readonly afterEventId?: string
}

/** @deprecated forbidden audit fixture */
export type LegacyAuditState = "pending"
`,
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(failureCodes(result.report)).toEqual(
      expect.arrayContaining([
        "forbidden-protocol-deprecated-contract",
        "forbidden-protocol-event-id-cursor",
        "forbidden-protocol-legacy-export",
        "forbidden-protocol-ui-contract"
      ])
    )
  })

  it("rejects protocol source modules that are not root-export reachable", async () => {
    await writeFile(
      unreachableFixturePath,
      `export interface AuditUnreachableContractFixture {
  readonly ok: true
}
`,
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(failureCodes(result.report)).toContain(
      "unreachable-protocol-source-module"
    )
    expect(result.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unreachable-protocol-source-module",
          path: "packages/protocol/src/__audit_unreachable_contract_fixture.ts"
        })
      ])
    )
  })

  it("rejects lower package source imports of upper app packages", async () => {
    await writeFile(
      upperAppImportFixturePath,
      `import { create } from "@wanex/assistant"

export const auditUpperAppImportFixture = create
`,
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(result.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-upper-app-source-import",
          package: "@wanex/storage",
          path: "packages/storage/src/__audit_upper_app_import_fixture.ts"
        })
      ])
    )
  })

  it("rejects imports from removed Assistant package identities", async () => {
    await writeFile(
      upperAppImportFixturePath,
      `import { create } from "@wanex/product"

export const auditRemovedAssistantImportFixture = create
`,
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(result.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "removed-assistant-package-import",
          package: "@wanex/storage",
          path: "packages/storage/src/__audit_upper_app_import_fixture.ts"
        })
      ])
    )
  })

  it("rejects lower package manifest dependencies on upper app packages", async () => {
    await mkdir(manifestDependencyFixtureSourceDir, { recursive: true })
    await writeFile(
      manifestDependencyFixturePackagePath,
      JSON.stringify(
        {
          name: "@wanex/storage",
          version: "0.0.0",
          type: "module",
          exports: {
            ".": "./src/index.ts"
          },
          dependencies: {
            "@wanex/assistant": "workspace:*"
          }
        },
        null,
        2
      ),
      "utf8"
    )
    await writeFile(
      manifestDependencyFixtureSourcePath,
      `export const auditManifestDependencyFixture = true\n`,
      "utf8"
    )
    await writeFile(
      manifestDependencyFixtureReadmePath,
      `# Storage Client Audit Fixture

## Entry Contract

## Use when

## Avoid when

## Lifecycle
`,
      "utf8"
    )

    const result = await runAudit()

    expect(result.code).toBe(1)
    expect(result.report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-upper-app-dependency",
          package: "@wanex/storage"
        })
      ])
    )
  })

  it("rejects dependencies on removed Assistant package identities", () => {
    expect(findManifestDependencyViolations({
      name: "@wanex/desktop",
      dependencies: { "@wanex/local-host": "workspace:*" }
    })).toEqual([
      expect.objectContaining({
        code: "removed-assistant-package-dependency",
        package: "@wanex/desktop"
      })
    ])
    expect(findManifestDependencyViolations({
      name: "@wanex/desktop",
      dependencies: { "@wanex/assistant-local-host": "workspace:*" }
    })).toEqual([
      expect.objectContaining({
        code: "removed-assistant-package-dependency",
        package: "@wanex/desktop"
      })
    ])
  })

  it("allows the TUI executable host to consume the Assistant Host", () => {
    expect(findManifestDependencyViolations({
      name: "@wanex/tui",
      dependencies: { "@wanex/assistant-host": "workspace:*" }
    })).toEqual([])
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
