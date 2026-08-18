import { upperAppPackages } from "./app-package-boundaries.mjs"

const forbiddenConnectorAdapterDependencies = [
  "@wanex/runtime",
  "@wanex/team",
  "@wanex/plugin",
  "@wanex/storage",
  "electron",
  "react",
  "react-dom",
  "next"
]

export function findManifestDependencyViolations(manifest) {
  const violations = []
  if (typeof manifest.name === "string" && manifest.name.startsWith("@wanex/")) {
    violations.push(...findUpperAppDependencyViolations(manifest))
  }
  if (typeof manifest.name === "string" && manifest.name.startsWith("@wanex/connector-adapter-")) {
    violations.push(...findConnectorAdapterDependencyViolations(manifest))
  }
  return violations
}

function findUpperAppDependencyViolations(manifest) {
  return dependencyEntries(manifest)
    .filter((dependency) =>
      upperAppPackages.includes(dependency.name) &&
        !isManifestLeafRecipeDependencyAllowed(manifest.name, dependency.name)
    )
    .map((dependency) => ({
      code: "forbidden-upper-app-dependency",
      package: manifest.name,
      message: `${manifest.name} must not depend on upper app package ${dependency.name} in ${dependency.field}`
    }))
}

function findConnectorAdapterDependencyViolations(manifest) {
  return dependencyEntries(manifest)
    .filter((dependency) => forbiddenConnectorAdapterDependencies.includes(dependency.name))
    .map((dependency) => ({
      code: "forbidden-connector-adapter-host-dependency",
      package: manifest.name,
      message: `connector adapter packages must stay SDK/adapter scoped and must not depend on host-owned package ${dependency.name} in ${dependency.field}`
    }))
}

function dependencyEntries(manifest) {
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies"
  ]
  return fields.flatMap((field) => {
    const value = manifest[field]
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return []
    }
    return Object.keys(value).map((name) => ({ field, name }))
  })
}

function isManifestLeafRecipeDependencyAllowed(packageName, dependencyName) {
  return (
    (dependencyName === "@wanex/product" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/local-host" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/web" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/tui" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product" &&
      packageName === "@wanex/web") ||
    (dependencyName === "@wanex/product" &&
      packageName === "@wanex/plugin-command-host") ||
    (dependencyName === "@wanex/plugin-command-host" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/local-host" &&
      packageName === "@wanex/desktop") ||
    (dependencyName === "@wanex/plugin-command-host" &&
      packageName === "@wanex/desktop") ||
    (dependencyName === "@wanex/local-host" &&
      packageName === "@wanex/tui") ||
    (dependencyName === "@wanex/product" &&
      packageName === "@wanex/local-host") ||
    (dependencyName === "@wanex/web" &&
      packageName === "@wanex/local-host") ||
    (dependencyName === "@wanex/product" &&
      packageName === "@wanex/tui") ||
    (dependencyName === "@wanex/app" &&
      packageName === "@wanex/eval-harness") ||
    false
  )
}
