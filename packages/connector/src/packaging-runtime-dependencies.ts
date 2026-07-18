import type {
  ConnectorAdapterPackageJsonLike,
  ConnectorAdapterPackagingValidationIssue
} from "./packaging-types.js"

import { connectorPackagingIssue } from "./packaging-issues.js"

const ALLOWED_WANEX_RUNTIME_DEPENDENCIES = new Set([
  "@wanex/connector",
  "@wanex/protocol"
])

const FORBIDDEN_RUNTIME_DEPENDENCIES = new Set([
  "@wanex/runtime",
  "@wanex/team",
  "@wanex/plugin",
  "@wanex/storage",
  "electron",
  "react",
  "react-dom",
  "next"
])

export function collectDeclaredRuntimeDependencies(
  packageJson: ConnectorAdapterPackageJsonLike
): ReadonlySet<string> {
  const dependencies = packageJson.dependencies ?? {}
  const peerDependencies = packageJson.peerDependencies ?? {}
  const optionalDependencies = packageJson.optionalDependencies ?? {}
  return new Set([
    ...Object.keys(dependencies),
    ...Object.keys(peerDependencies),
    ...Object.keys(optionalDependencies)
  ])
}

export function validateDeclaredRuntimeDependencyNames(
  dependencies: Readonly<Record<string, string>>,
  errors: ConnectorAdapterPackagingValidationIssue[]
): void {
  for (const name of Object.keys(dependencies)) {
    if (isForbiddenRuntimeDependency(name)) {
      errors.push(connectorPackagingIssue(
        "connector_packaging.forbidden_runtime_dependency",
        `Connector adapter runtime dependencies must not include app/runtime host package: ${name}`,
        name
      ))
    }
  }
}

function isForbiddenRuntimeDependency(name: string): boolean {
  return (
    FORBIDDEN_RUNTIME_DEPENDENCIES.has(name) ||
    (name.startsWith("@wanex/") &&
      !ALLOWED_WANEX_RUNTIME_DEPENDENCIES.has(name))
  )
}
