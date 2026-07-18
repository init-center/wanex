import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

export async function loadExternalFixturePolicy(workspaceRoot) {
  const policyPath = join(
    workspaceRoot,
    "scripts/external-consumers/fixtures.json"
  )
  const policy = JSON.parse(await readFile(policyPath, "utf8"))
  if (policy.schemaVersion !== 1 || !isRecord(policy.fixtures)) {
    throw new Error("external fixture policy schemaVersion must be 1")
  }
  return Object.entries(policy.fixtures)
    .map(([id, configured]) => ({
      id,
      fixtureDir: resolve(
        workspaceRoot,
        "scripts/external-consumers/fixtures",
        configured.path
      ),
      dependencies: [...configured.dependencies].sort()
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function validateExternalFixtureManifest(fixture, manifest) {
  const failures = []
  if (manifest.name !== `wanex-external-${fixture.id}`) {
    failures.push(`name must be wanex-external-${fixture.id}`)
  }
  if (manifest.private !== true || manifest.type !== "module") {
    failures.push("fixture must be a private ESM project")
  }
  if (!isRecord(manifest.dependencies)) {
    failures.push("fixture dependencies are required")
    return failures
  }
  const names = Object.keys(manifest.dependencies).sort()
  if (JSON.stringify(names) !== JSON.stringify(fixture.dependencies)) {
    failures.push(
      `dependencies must be exactly ${fixture.dependencies.join(",")}`
    )
  }
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    if (!name.startsWith("@wanex/")) {
      failures.push(`non-Wanex runtime dependency is forbidden: ${name}`)
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version))) {
      failures.push(`dependency ${name} must use an exact version`)
    }
  }
  for (const field of ["devDependencies", "peerDependencies", "optionalDependencies", "scripts"]) {
    if (manifest[field] !== undefined) failures.push(`${field} is forbidden`)
  }
  return failures
}

export function parseFixtureReceipt(stdout, fixtureId) {
  let value
  try {
    value = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${fixtureId} did not emit one JSON receipt: ${error.message}`)
  }
  if (!isRecord(value) || value.id !== fixtureId || value.ok !== true) {
    throw new Error(`${fixtureId} emitted an invalid receipt`)
  }
  return value
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
