#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")

const rules = [
  {
    packageName: "@wanex/cli",
    reason: "CLI cold path must not bundle plugin hosts or concrete connectors",
    forbiddenDependencies: [
      "@wanex/plugin",
      "@wanex/connector"
    ]
  }
]

const packageIndex = new Map()
for (const relPath of [
  "apps/cli/package.json"
]) {
  const manifest = JSON.parse(await readFile(join(rootDir, relPath), "utf8"))
  packageIndex.set(manifest.name, {
    path: relPath,
    manifest
  })
}

const failures = []
for (const rule of rules) {
  const entry = packageIndex.get(rule.packageName)
  if (entry === undefined) {
    failures.push({
      code: "distribution-package-missing",
      package: rule.packageName,
      dependency: null,
      message: "distribution audit target package is missing"
    })
    continue
  }
  const dependencies = {
    ...(entry.manifest.dependencies ?? {}),
    ...(entry.manifest.optionalDependencies ?? {})
  }
  for (const dependency of rule.forbiddenDependencies) {
    if (dependencies[dependency] !== undefined) {
      failures.push({
        code: "forbidden-cold-path-dependency",
        package: rule.packageName,
        path: entry.path,
        dependency,
        message: rule.reason
      })
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  checkedPackages: rules.map((rule) => rule.packageName),
  failures
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Distribution Audit")
  console.log("")
  console.log(`Checked packages: ${report.checkedPackages.length}`)
  console.log(`Failures: ${failures.length}`)
  console.log("")
  console.log("Failures:")
  if (failures.length === 0) {
    console.log("- none")
  } else {
    for (const failure of failures) {
      console.log(
        `- [${failure.code}] ${failure.package}: ${failure.dependency} (${failure.message})`
      )
    }
  }
}

if (failures.length > 0) {
  process.exitCode = 1
}
