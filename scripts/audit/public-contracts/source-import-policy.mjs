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
        "@wanex/product-app",
        new Set([
          "packages/eval-harness/src/product-capability/command-port-scenario.ts",
          "packages/eval-harness/src/product-capability/json-mapping-scenario.ts",
          "packages/eval-harness/src/product-capability/readiness-scenario.ts",
          "packages/eval-harness/src/product-app-backend-backend-shell-scenarios.ts",
          "packages/eval-harness/src/product-app-backend-diagnostics-detail-scenarios.ts",
          "packages/eval-harness/src/product-app-backend-integration-contract-scenarios.ts",
          "packages/eval-harness/src/product-app-backend-overview-scenarios.ts",
          "packages/eval-harness/src/product-app-backend-workbench-scenarios.ts",
          "packages/eval-harness/src/product-app/host-endpoint-scenario.ts",
          "packages/eval-harness/src/product-app/plugin-action-scenario.ts",
          "packages/eval-harness/src/product-app/conversation-helpers.ts",
          "packages/eval-harness/src/product-app/conversation-lifecycle-scenario.ts",
          "packages/eval-harness/src/product-app/surface-client-scenario.ts",
          "packages/eval-harness/src/product-app/surface-message-transport-scenario.ts",
          "packages/eval-harness/src/product-app/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product-app/web-surface-scenario.ts",
          "packages/eval-harness/src/product-app-scenarios.ts",
          "packages/eval-harness/src/product-app-tui/host-message-transport-scenario.ts",
          "packages/eval-harness/src/product-app-tui/line-session-scenario.ts",
          "packages/eval-harness/src/product-app-tui/surface-scenario.ts",
          "packages/eval-harness/src/product-app/declarative-input-scenario.ts",
          "packages/eval-harness/src/tui-product/controller-path-scenario.ts",
          "packages/eval-harness/src/tui-product/helpers.ts"
        ])
      ],
      [
        "@wanex/product-app-web",
        new Set([
          "packages/eval-harness/src/product-app/conversation-lifecycle-scenario.ts",
          "packages/eval-harness/src/product-app/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product-app/web-surface-scenario.ts",
          "packages/eval-harness/src/product-app/declarative-input-scenario.ts"
        ])
      ],
      [
        "@wanex/product-app-local",
        new Set([
          "packages/eval-harness/src/product-app/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product-app/local-desktop-host-scenario.ts",
          "packages/eval-harness/src/product-app/local-host-scenario.ts",
          "packages/eval-harness/src/product-app/web-surface-scenario.ts"
        ])
      ],
      [
        "@wanex/product-app-command-host",
        new Set([
          "packages/eval-harness/src/product-app/plugin-action-scenario.ts",
          "packages/eval-harness/src/product-app/declarative-input-scenario.ts"
        ])
      ],
      [
        "@wanex/product-app-tui",
        new Set([
          "packages/eval-harness/src/product-app/feedback-matrix-scenario.ts",
          "packages/eval-harness/src/product-app-tui/cli-scenario.ts",
          "packages/eval-harness/src/product-app-tui/host-message-transport-scenario.ts",
          "packages/eval-harness/src/product-app-tui/line-session-scenario.ts",
          "packages/eval-harness/src/product-app-tui/surface-scenario.ts",
          "packages/eval-harness/src/product-app/declarative-input-scenario.ts",
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
