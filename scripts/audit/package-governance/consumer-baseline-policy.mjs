const workspaceDependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies"
]

export function createConsumerBaseline(manifests, packageRoles) {
  const names = new Set(manifests.map((manifest) => manifest.name))
  const packages = Object.fromEntries(
    manifests
      .map((manifest) => manifest.name)
      .sort()
      .map((name) => [name, { consumers: [], realConsumers: [] }])
  )

  for (const consumer of manifests) {
    for (const field of workspaceDependencyFields) {
      for (const dependency of Object.keys(consumer.manifest[field] ?? {}).sort()) {
        if (!names.has(dependency)) {
          continue
        }
        packages[dependency].consumers.push({ package: consumer.name, field })
        if (!isSyntheticRole(packageRoles[consumer.name])) {
          packages[dependency].realConsumers.push({ package: consumer.name, field })
        }
      }
    }
  }

  for (const entry of Object.values(packages)) {
    entry.consumers.sort(byConsumer)
    entry.realConsumers.sort(byConsumer)
  }

  return {
    schemaVersion: 1,
    syntheticConsumerRoles: ["example", "test"],
    packages
  }
}

export function findConsumerBaselineViolations({
  manifests,
  packageRoles,
  baseline
}) {
  const expected = createConsumerBaseline(manifests, packageRoles)
  const failures = []
  const actualPackages = baseline.packages ?? {}

  if (baseline.schemaVersion !== 1) {
    failures.push(failure(
      "unsupported-consumer-baseline-schema",
      "*",
      `expected schemaVersion 1, received ${String(baseline.schemaVersion)}`
    ))
  }
  if (JSON.stringify(baseline.syntheticConsumerRoles) !== JSON.stringify(expected.syntheticConsumerRoles)) {
    failures.push(failure(
      "consumer-baseline-role-policy-drift",
      "*",
      "synthetic consumer roles must remain example and test"
    ))
  }

  for (const [packageName, expectedEntry] of Object.entries(expected.packages)) {
    const actualEntry = actualPackages[packageName]
    if (actualEntry === undefined) {
      failures.push(failure(
        "missing-consumer-baseline-package",
        packageName,
        "consumer baseline must cover every workspace package"
      ))
      continue
    }
    compareConsumers(failures, packageName, "consumers", expectedEntry.consumers, actualEntry.consumers)
    compareConsumers(
      failures,
      packageName,
      "realConsumers",
      expectedEntry.realConsumers,
      actualEntry.realConsumers
    )
  }

  for (const packageName of Object.keys(actualPackages)) {
    if (expected.packages[packageName] === undefined) {
      failures.push(failure(
        "unknown-consumer-baseline-package",
        packageName,
        "consumer baseline entry has no workspace manifest"
      ))
    }
  }

  return failures
}

function compareConsumers(failures, packageName, field, expected, actual = []) {
  const expectedEdges = new Set(expected.map(edgeKey))
  const actualEdges = new Set(actual.map(edgeKey))
  if (actualEdges.size !== actual.length) {
    failures.push(failure(
      "duplicate-consumer-baseline-edge",
      packageName,
      `${field} contains duplicate dependency edges`
    ))
  }
  for (const edge of expectedEdges) {
    if (!actualEdges.has(edge)) {
      failures.push(failure(
        "unreviewed-workspace-dependency-edge",
        packageName,
        `${field} is missing current edge ${edge}`
      ))
    }
  }
  for (const edge of actualEdges) {
    if (!expectedEdges.has(edge)) {
      failures.push(failure(
        "stale-workspace-dependency-edge",
        packageName,
        `${field} records absent edge ${edge}`
      ))
    }
  }
}

function isSyntheticRole(role) {
  return role === "example" || role === "test"
}

function edgeKey(edge) {
  return `${String(edge.package)}:${String(edge.field)}`
}

function byConsumer(left, right) {
  return left.package.localeCompare(right.package) || left.field.localeCompare(right.field)
}

function failure(code, packageName, message) {
  return { code, package: packageName, message }
}
