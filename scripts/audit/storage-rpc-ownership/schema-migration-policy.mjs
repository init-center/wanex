export function findStorageRpcSchemaMigrationViolations({
  schema,
  ownership,
  handwrittenRustCommands,
  typescriptSourcesByFile
}) {
  const failures = []
  const definitions = schema.$defs ?? {}
  const schemaCommands = concreteSchemaCommands(definitions)
  const schemaCommandSet = new Set(schemaCommands)

  if (schemaCommandSet.size !== schemaCommands.length) {
    failures.push(failure(
      "duplicate-schema-rpc-command",
      "*",
      "a concrete command discriminant appears in more than one schema definition"
    ))
  }

  for (const command of handwrittenRustCommands) {
    if (schemaCommandSet.has(command)) {
      failures.push(failure(
        "migrated-command-retained-in-handwritten-rust",
        command,
        "a schema-owned command still has a handwritten Rust Request variant"
      ))
    }
  }

  const migratedDomains = Object.entries(ownership.domains ?? {})
    .filter(([, entry]) => typeof entry.schemaCommandUnion === "string")
  for (const [domain, entry] of migratedDomains) {
    const unionName = entry.schemaCommandUnion
    const union = definitions[unionName]
    if (union === undefined) {
      failures.push(failure(
        "missing-domain-schema-command-union",
        domain,
        `schema definition ${unionName} is missing`
      ))
      continue
    }
    const reachable = reachableDefinitions(unionName, definitions)
    const actual = [...reachable]
      .map((name) => definitions[name]?.properties?.command?.enum)
      .filter((values) => Array.isArray(values) && values.length === 1)
      .map(([command]) => command)
      .sort()
    const expected = [...entry.commands].sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(failure(
        "domain-schema-command-mismatch",
        domain,
        `expected ${expected.join(", ")}; received ${actual.join(", ")}`
      ))
    }

    for (const name of reachable) {
      const definition = definitions[name]
      if (
        definition?.type === "object" &&
        definition.additionalProperties !== false &&
        (typeof definition.additionalProperties !== "object" ||
          definition.additionalProperties === null)
      ) {
        failures.push(failure(
          "open-migrated-schema-object",
          name,
          `${domain} reaches an object that is not closed with additionalProperties false`
        ))
      }
    }

    for (const file of entry.typescriptFiles ?? []) {
      if (!typescriptSourcesByFile[file]?.includes(unionName)) {
        failures.push(failure(
          "missing-strict-typescript-command-union",
          file,
          `${domain} must consume generated ${unionName}`
        ))
      }
    }
  }

  const fallback = definitions.UnmigratedStorageRpcDomainCommand
  if (fallback === undefined) {
    const ownedCount = Object.values(ownership.domains ?? {})
      .reduce((count, entry) => count + (entry.commands?.length ?? 0), 0)
    if (schemaCommandSet.size !== ownedCount) {
      failures.push(failure(
        "removed-fallback-before-complete-schema-migration",
        "UnmigratedStorageRpcDomainCommand",
        `schema owns ${schemaCommandSet.size} of ${ownedCount} commands`
      ))
    }
  } else {
    const excluded = fallback.properties?.command?.not?.enum
    const expected = ["rpc-describe", ...schemaCommandSet].sort()
    const actual = Array.isArray(excluded) ? [...excluded].sort() : []
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(failure(
        "unmigrated-command-exclusion-mismatch",
        "UnmigratedStorageRpcDomainCommand",
        `expected exclusions ${expected.join(", ")}; received ${actual.join(", ")}`
      ))
    }
  }

  return failures
}

function concreteSchemaCommands(definitions) {
  return Object.values(definitions)
    .map((definition) => definition?.properties?.command?.enum)
    .filter((values) => Array.isArray(values) && values.length === 1)
    .map(([command]) => command)
    .filter((command) => command !== "rpc-describe")
}

function reachableDefinitions(rootName, definitions) {
  const visited = new Set()
  const visit = (name) => {
    if (visited.has(name)) return
    visited.add(name)
    visitNode(definitions[name], visit)
  }
  visit(rootName)
  return visited
}

function visitNode(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) visitNode(item, visit)
    return
  }
  if (typeof node !== "object" || node === null) return
  if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
    visit(node.$ref.slice("#/$defs/".length))
  }
  for (const value of Object.values(node)) visitNode(value, visit)
}

function failure(code, subject, message) {
  return { code, subject, message }
}
