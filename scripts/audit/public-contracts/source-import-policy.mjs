import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { repositoryRelativePath } from "../repository-path.mjs"
import { isAppPackage, upperAppPackages } from "./app-package-boundaries.mjs"

const packageScopedSourceImportAllowlist = new Map([
  [
    "@wanex/eval-harness",
    new Map([
      [
        "@wanex/app",
        new Set([
          "packages/eval-harness/src/product-bootstrap/app-default-entry-scenario.ts"
        ])
      ],
      [
        "@wanex/product",
        new Set([
          "packages/eval-harness/src/product-capability/command-port-scenario.ts",
          "packages/eval-harness/src/product-capability/json-mapping-scenario.ts",
          "packages/eval-harness/src/product-capability/readiness-scenario.ts",
          "packages/eval-harness/src/product-backend-shell-scenarios.ts",
          "packages/eval-harness/src/product-backend-diagnostics-scenarios.ts",
          "packages/eval-harness/src/product-backend-integration-scenarios.ts",
          "packages/eval-harness/src/product-backend-overview-scenarios.ts",
          "packages/eval-harness/src/product-backend-workbench-scenarios.ts",
          "packages/eval-harness/src/product/host-endpoint-scenario.ts",
          "packages/eval-harness/src/product/plugin-command-product.ts",
          "packages/eval-harness/src/product/plugin-action-scenario.ts",
          "packages/eval-harness/src/product/conversation-helpers.ts",
          "packages/eval-harness/src/product/conversation-lifecycle-scenario.ts",
          "packages/eval-harness/src/product/guided-follow-up-scenario.ts",
          "packages/eval-harness/src/product/goal-journey-scenario.ts",
          "packages/eval-harness/src/product/long-session-continuity-scenario.ts",
          "packages/eval-harness/src/product/plan-journey-scenario.ts",
          "packages/eval-harness/src/product/recovery-review-scenario.ts",
          "packages/eval-harness/src/product/same-turn-steering-scenario.ts",
          "packages/eval-harness/src/product/tool-approval-journey-scenario.ts",
          "packages/eval-harness/src/product/side-query-scenario.ts",
          "packages/eval-harness/src/product/surface-client-scenario.ts",
          "packages/eval-harness/src/product/surface-message-transport-scenario.ts",
          "packages/eval-harness/src/product/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product/web-surface-scenario.ts",
          "packages/eval-harness/src/product-scenarios.ts",
          "packages/eval-harness/src/tui/host-message-transport-scenario.ts",
          "packages/eval-harness/src/tui/line-session-scenario.ts",
          "packages/eval-harness/src/tui/surface-scenario.ts",
          "packages/eval-harness/src/product/declarative-input-scenario.ts",
          "packages/eval-harness/src/tui-product/controller-path-scenario.ts",
          "packages/eval-harness/src/tui-product/helpers.ts"
        ])
      ],
      [
        "@wanex/web",
        new Set([
          "packages/eval-harness/src/product/conversation-lifecycle-scenario.ts",
          "packages/eval-harness/src/product/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product/goal-journey-scenario.ts",
          "packages/eval-harness/src/product/guided-follow-up-scenario.ts",
          "packages/eval-harness/src/product/long-session-continuity-scenario.ts",
          "packages/eval-harness/src/product/recovery-review-scenario.ts",
          "packages/eval-harness/src/product/same-turn-steering-scenario.ts",
          "packages/eval-harness/src/product/tool-approval-journey-scenario.ts",
          "packages/eval-harness/src/product/web-surface-scenario.ts",
          "packages/eval-harness/src/product/declarative-input-scenario.ts"
        ])
      ],
      [
        "@wanex/local-host",
        new Set([
          "packages/eval-harness/src/product/capability-setup-continuation-scenario.ts",
          "packages/eval-harness/src/product/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product/local-desktop-host-scenario.ts",
          "packages/eval-harness/src/product/local-host-scenario.ts",
          "packages/eval-harness/src/product/web-surface-scenario.ts"
        ])
      ],
      [
        "@wanex/plugin-command-host",
        new Set([
          "packages/eval-harness/src/product/plugin-command-product.ts",
          "packages/eval-harness/src/product/plugin-action-scenario.ts",
          "packages/eval-harness/src/product/declarative-input-scenario.ts"
        ])
      ],
      [
        "@wanex/tui",
        new Set([
          "packages/eval-harness/src/product/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product/goal-journey-scenario.ts",
          "packages/eval-harness/src/product/tool-approval-journey-scenario.ts",
          "packages/eval-harness/src/tui/cli-scenario.ts",
          "packages/eval-harness/src/tui/host-message-transport-scenario.ts",
          "packages/eval-harness/src/tui/line-session-scenario.ts",
          "packages/eval-harness/src/tui/surface-scenario.ts",
          "packages/eval-harness/src/product/declarative-input-scenario.ts",
          "packages/eval-harness/src/tui-product/controller-path-scenario.ts",
          "packages/eval-harness/src/tui-product/helpers.ts"
        ])
      ],
      [
        "@wanex/cli",
        new Set([
          "packages/eval-harness/src/operational/cli-diagnostics-scenario.ts",
          "packages/eval-harness/src/operational/cli-memory-sweep-scenario.ts",
          "packages/eval-harness/src/product-bootstrap/cli-support-bundle-scenario.ts"
        ])
      ]
    ])
  ]
])

export async function findForbiddenSourceImports(options) {
  const sourceFiles = await findSourceFiles(options.packageDir)
  const violations = []
  for (const sourceFile of sourceFiles) {
    const relSourceFile = repositoryRelativePath(options.rootDir, sourceFile)
    const imports = importedPackageSpecifiers(await readFile(sourceFile, "utf8"))
    for (const imported of imports) {
      if (!isForbiddenSourceImport(options.packageName, relSourceFile, imported)) {
        continue
      }
      violations.push({
        code: "forbidden-upper-app-source-import",
        package: options.packageName,
        path: relSourceFile,
        message: `${options.packageName} must not import upper app package ${imported} from ${relSourceFile}`
      })
    }
  }
  return violations
}

async function findSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "target"
    ) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await findSourceFiles(fullPath)))
      continue
    }
    if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
      entry.name !== "package.json"
    ) {
      paths.push(fullPath)
    }
  }
  return paths
}

function importedPackageSpecifiers(source) {
  const imports = new Set()
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (typeof specifier === "string" && specifier.startsWith("@wanex/")) {
        imports.add(packageNameFromSpecifier(specifier))
      }
    }
  }
  return [...imports].sort()
}

function packageNameFromSpecifier(specifier) {
  const parts = specifier.split("/")
  return `${parts[0]}/${parts[1]}`
}

function isForbiddenSourceImport(packageName, relSourceFile, imported) {
  if (isAppPackage(packageName)) {
    return false
  }
  if (imported === "@wanex/cli") {
    return !isSourceImportAllowed(packageName, imported, relSourceFile)
  }
  if (!upperAppPackages.includes(imported)) {
    return false
  }
  return !isSourceImportAllowed(packageName, imported, relSourceFile)
}

function isSourceImportAllowed(packageName, imported, relSourceFile) {
  const packageAllowlist = packageScopedSourceImportAllowlist.get(packageName)
  if (packageAllowlist === undefined) {
    return false
  }
  const sourceAllowlist = packageAllowlist.get(imported)
  return sourceAllowlist?.has(relSourceFile) ?? false
}
