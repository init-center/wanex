import {
  removedAssistantPackages,
  upperAppPackages
} from "./app-package-boundaries.mjs"

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
  const dependencies = dependencyEntries(manifest)
  return [
    ...dependencies
      .filter((dependency) => removedAssistantPackages.includes(dependency.name))
      .map((dependency) => ({
        code: "removed-assistant-package-dependency",
        package: manifest.name,
        message: `${manifest.name} must not depend on removed Assistant owner ${dependency.name} in ${dependency.field}`
      })),
    ...dependencies
    .filter((dependency) =>
      upperAppPackages.includes(dependency.name) &&
        !isManifestLeafRecipeDependencyAllowed(manifest.name, dependency.name)
    )
    .map((dependency) => ({
      code: "forbidden-upper-app-dependency",
      package: manifest.name,
      message: `${manifest.name} must not depend on upper app package ${dependency.name} in ${dependency.field}`
    }))
  ]
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
    (dependencyName === "@wanex/assistant" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/assistant-host" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/assistant-ui" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/tui" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/assistant" &&
      packageName === "@wanex/assistant-plugin-host") ||
    (dependencyName === "@wanex/assistant-plugin-host" &&
      packageName === "@wanex/eval-harness") ||
    (dependencyName === "@wanex/assistant-host" &&
      packageName === "@wanex/desktop") ||
    (dependencyName === "@wanex/assistant-plugin-host" &&
      packageName === "@wanex/desktop") ||
    (dependencyName === "@wanex/assistant-ui" &&
      packageName === "@wanex/desktop") ||
    (dependencyName === "@wanex/assistant-host" &&
      packageName === "@wanex/tui") ||
    (dependencyName === "@wanex/assistant-host" &&
      packageName === "@wanex/server") ||
    (dependencyName === "@wanex/assistant" &&
      packageName === "@wanex/assistant-host") ||
    (dependencyName === "@wanex/assistant-ui" &&
      packageName === "@wanex/assistant-host") ||
    (dependencyName === "@wanex/assistant" &&
      packageName === "@wanex/assistant-ui") ||
    (dependencyName === "@wanex/assistant" &&
      packageName === "@wanex/tui") ||
    (dependencyName === "@wanex/app" &&
      packageName === "@wanex/eval-harness") ||
    false
  )
}
