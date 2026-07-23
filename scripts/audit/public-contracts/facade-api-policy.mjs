const facadeContracts = new Map([
  [
    "@wanex/app",
    {
      typeFile: "types.ts",
      allowedRootModules: new Set([
        "./app.js",
        "./context-profile.js",
        "./result-envelope.js",
        "./types.js"
      ])
    }
  ],
  [
    "@wanex/runtime",
    {
      typeFile: "types.ts",
      allowedRootModules: new Set(["./runtime.js", "./types.js"])
    }
  ]
])

export function facadeApiContract(packageName) {
  return facadeContracts.get(packageName)
}

export function findFacadeApiViolations(options) {
  const contract = facadeContracts.get(options.packageName)
  if (contract === undefined) {
    return []
  }
  const violations = []
  if (/\bexport\s+\*/.test(options.rootSource)) {
    violations.push(violation(
      options.packageName,
      "facade-wildcard-export",
      `${options.packageName} root must not wildcard-export implementation modules`
    ))
  }
  for (const specifier of exportedModuleSpecifiers(options.rootSource)) {
    if (!contract.allowedRootModules.has(specifier)) {
      violations.push(violation(
        options.packageName,
        "facade-forbidden-root-module",
        `${options.packageName} root must not export ${specifier}`
      ))
    }
  }
  if (/\b(?:import|export)\b[^\n]*["']@wanex\//.test(options.typeSource)) {
    violations.push(violation(
      options.packageName,
      "facade-internal-type-import",
      `${options.packageName} public types must be locally owned and must not import @wanex internal types`
    ))
  }
  return violations
}

function exportedModuleSpecifiers(source) {
  const modules = new Set()
  const patterns = [
    /\bexport\s+\*\s+from\s+["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']([^"']+)["']/gs
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      modules.add(match[1])
    }
  }
  return modules
}

function violation(packageName, code, message) {
  return { package: packageName, code, message }
}
