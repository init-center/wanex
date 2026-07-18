const dispositions = new Set([
  "retain",
  "merge",
  "rename",
  "delete",
  "value-gated"
])

export function findPackageDispositionViolations({
  manifests,
  packageRoles,
  dispositionContract
}) {
  const failures = []
  const manifestByName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  const active = dispositionContract.packages ?? {}
  const tombstones = dispositionContract.tombstones ?? {}

  if (dispositionContract.schemaVersion !== 1) {
    failures.push(failure(
      "unsupported-package-disposition-schema",
      "*",
      `expected schemaVersion 1, received ${String(dispositionContract.schemaVersion)}`
    ))
  }

  for (const manifest of manifests) {
    const entry = active[manifest.name]
    if (entry === undefined) {
      failures.push(failure(
        "missing-package-disposition",
        manifest.name,
        "every workspace package must have one active disposition"
      ))
      continue
    }
    if (entry.path !== manifest.path) {
      failures.push(failure(
        "package-disposition-path-mismatch",
        manifest.name,
        `expected path ${manifest.path}, received ${String(entry.path)}`
      ))
    }
    if (entry.role !== packageRoles[manifest.name]) {
      failures.push(failure(
        "package-disposition-role-mismatch",
        manifest.name,
        `expected role ${String(packageRoles[manifest.name])}, received ${String(entry.role)}`
      ))
    }
    failures.push(...validateDispositionEntry(manifest.name, entry, false))
  }

  for (const [packageName, entry] of Object.entries(active)) {
    if (!manifestByName.has(packageName)) {
      failures.push(failure(
        "unknown-package-disposition",
        packageName,
        "active disposition has no workspace manifest"
      ))
    }
    if (tombstones[packageName] !== undefined) {
      failures.push(failure(
        "active-package-is-tombstoned",
        packageName,
        "a package cannot be active and tombstoned"
      ))
    }
  }

  for (const [packageName, entry] of Object.entries(tombstones)) {
    failures.push(...validateDispositionEntry(packageName, entry, true))
    if (manifestByName.has(packageName)) {
      failures.push(failure(
        "tombstoned-package-exists",
        packageName,
        "tombstoned package name must not have a workspace manifest"
      ))
    }
  }

  return failures
}

function validateDispositionEntry(packageName, entry, tombstone) {
  const failures = []
  if (!dispositions.has(entry.disposition)) {
    failures.push(failure(
      "invalid-package-disposition",
      packageName,
      `unsupported disposition ${String(entry.disposition)}`
    ))
  }
  if (tombstone && entry.disposition !== "delete") {
    failures.push(failure(
      "invalid-tombstone-disposition",
      packageName,
      "tombstones must use the delete disposition"
    ))
  }
  for (const field of ["targetOwner", "targetPhase", "rationale", "evidence"]) {
    if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
      failures.push(failure(
        "incomplete-package-disposition",
        packageName,
        `${field} must be a non-empty string`
      ))
    }
  }
  return failures
}

function failure(code, packageName, message) {
  return { code, package: packageName, message }
}
