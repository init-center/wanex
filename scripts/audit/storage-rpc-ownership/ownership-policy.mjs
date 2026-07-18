export function findStorageRpcOwnershipViolations({
  ownership,
  typescriptCommandsByFile,
  rustCommands
}) {
  const failures = []
  const ownedCommands = new Map()
  const coveredFiles = new Set()

  if (ownership.schemaVersion !== 1) {
    failures.push(failure("unsupported-rpc-ownership-schema", "*", "schemaVersion must be 1"))
  }

  for (const [domain, entry] of Object.entries(ownership.domains ?? {})) {
    if (entry.classification !== "core" && entry.classification !== "optional") {
      failures.push(failure("invalid-rpc-domain-classification", domain, "classification must be core or optional"))
    }
    if (typeof entry.owner !== "string" || entry.owner.trim().length === 0) {
      failures.push(failure("missing-rpc-domain-owner", domain, "owner must be non-empty"))
    }
    const expectedForDomain = new Set()
    for (const file of entry.typescriptFiles ?? []) {
      coveredFiles.add(file)
      for (const command of typescriptCommandsByFile[file] ?? []) {
        expectedForDomain.add(command)
      }
    }
    const declaredForDomain = new Set(entry.commands ?? [])
    if (declaredForDomain.size !== (entry.commands ?? []).length) {
      failures.push(failure("duplicate-rpc-command-in-domain", domain, "domain command list contains duplicates"))
    }
    for (const command of declaredForDomain) {
      const previous = ownedCommands.get(command)
      if (previous !== undefined) {
        failures.push(failure("rpc-command-has-multiple-owners", command, `${previous} and ${domain}`))
      }
      ownedCommands.set(command, domain)
      if (!expectedForDomain.has(command)) {
        failures.push(failure("rpc-command-domain-file-mismatch", command, `declared in ${domain} but absent from its TypeScript files`))
      }
    }
    for (const command of expectedForDomain) {
      if (!declaredForDomain.has(command)) {
        failures.push(failure("unowned-typescript-rpc-command", command, `found in ${domain} TypeScript files`))
      }
    }
  }

  for (const [file, commands] of Object.entries(typescriptCommandsByFile)) {
    if (commands.length > 0 && !coveredFiles.has(file)) {
      failures.push(failure("unclassified-typescript-rpc-file", file, "command-bearing client file has no ownership domain"))
    }
  }

  const rustSet = new Set(rustCommands)
  for (const command of ownedCommands.keys()) {
    if (!rustSet.has(command)) {
      failures.push(failure("owned-rpc-command-missing-in-rust", command, "ownership command has no Rust Request variant"))
    }
  }
  for (const command of rustSet) {
    if (!ownedCommands.has(command)) {
      failures.push(failure("unowned-rust-rpc-command", command, "Rust Request variant has no owner"))
    }
  }

  return failures
}

function failure(code, subject, message) {
  return { code, subject, message }
}
