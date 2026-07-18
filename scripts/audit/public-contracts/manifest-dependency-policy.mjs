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
    (dependencyName === "@wanex/product-app" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product-app-local" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product-app-web" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product-app-tui" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product-app" &&
      packageName === "@wanex/product-app-web") ||
    (dependencyName === "@wanex/product-app" &&
      packageName === "@wanex/product-app-command-host") ||
    (dependencyName === "@wanex/product-app-command-host" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/product-app" &&
      packageName === "@wanex/product-app-local") ||
    (dependencyName === "@wanex/product-app-web" &&
      packageName === "@wanex/product-app-local") ||
    (dependencyName === "@wanex/product-app" &&
      packageName === "@wanex/product-app-tui") ||
    (dependencyName === "@wanex/app" &&
      packageName === "@wanex/eval-harness") ||
    false
  )
}
