export const packageRoles = [
  "public-facade",
  "public-capability",
  "internal",
  "app",
  "example",
  "test"
]

const packageRoleSet = new Set(packageRoles)
const productionRoles = new Set([
  "public-facade",
  "public-capability",
  "internal",
  "app"
])
const runtimeDependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies"
]

export function findPackageRoleCoverageViolations(manifests, roleByPackage) {
  const manifestNames = new Set(manifests.map((manifest) => manifest.name))
  const violations = []

  for (const manifest of manifests) {
    const role = roleByPackage[manifest.name]
    if (role === undefined) {
      violations.push({
        code: "missing-package-role",
        package: manifest.name,
        message: `${manifest.name} must have one role in docs/architecture/package-roles.json`
      })
      continue
    }
    if (!packageRoleSet.has(role)) {
      violations.push({
        code: "invalid-package-role",
        package: manifest.name,
        message: `${manifest.name} has unsupported package role ${String(role)}`
      })
    }
  }

  for (const packageName of Object.keys(roleByPackage)) {
    if (!manifestNames.has(packageName)) {
      violations.push({
        code: "unknown-package-role-entry",
        package: packageName,
        message: `${packageName} has a package role but no workspace manifest`
      })
    }
  }

  return violations
}

export function findPackageRoleDependencyViolations(manifest, roleByPackage) {
  const packageRole = roleByPackage[manifest.name]
  if (!packageRoleSet.has(packageRole)) {
    return []
  }

  const violations = []
  for (const dependency of runtimeDependencyEntries(manifest)) {
    const dependencyRole = roleByPackage[dependency.name]
    if (dependencyRole === undefined) {
      continue
    }
    if (dependencyRole === "test" && packageRole !== "test") {
      violations.push({
        code: "forbidden-runtime-test-dependency",
        package: manifest.name,
        dependency: dependency.name,
        message: `${manifest.name} (${packageRole}) must not include test package ${dependency.name} in ${dependency.field}`
      })
      continue
    }
    if (dependencyRole === "example" && productionRoles.has(packageRole)) {
      violations.push({
        code: "forbidden-production-example-dependency",
        package: manifest.name,
        dependency: dependency.name,
        message: `${manifest.name} (${packageRole}) must not include example package ${dependency.name} in ${dependency.field}`
      })
    }
  }
  return violations
}

function runtimeDependencyEntries(manifest) {
  return runtimeDependencyFields.flatMap((field) => {
    const value = manifest[field]
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return []
    }
    return Object.keys(value).map((name) => ({ field, name }))
  })
}
