export const removedRuntimePackages = [
  "@wanex/agent-context-runtime",
  "@wanex/agent-core",
  "@wanex/agent-runtime",
  "@wanex/agent-worker",
  "@wanex/app-bootstrap",
  "@wanex/config-core",
  "@wanex/context-memory",
  "@wanex/event-core",
  "@wanex/file-context-contributions",
  "@wanex/instruction-runtime",
  "@wanex/memory-runtime",
  "@wanex/resource-runtime",
  "@wanex/runtime-artifacts",
  "@wanex/runtime-composition",
  "@wanex/runtime-core",
  "@wanex/runtime-host",
  "@wanex/session-core",
  "@wanex/skill-runtime",
  "@wanex/worker-core"
]

export const forbiddenRuntimeDependencies = [
  "@wanex/app",
  "@wanex/app-bootstrap",
  "@wanex/connector",
  "@wanex/plugin",
  "@wanex/runtime-composition",
  "@wanex/team",
  "@wanex/workspace"
]

export function findRuntimeConsolidationFailures(input) {
  const failures = []
  const manifests = new Map(input.manifests.map((item) => [item.name, item]))

  for (const packageName of removedRuntimePackages) {
    if (manifests.has(packageName)) {
      failures.push({
        code: "scheduled-runtime-package-remains",
        subject: packageName,
        message: `${packageName} must be physically merged or deleted in Phase 748`
      })
    }
  }

  for (const source of input.sources) {
    for (const packageName of removedRuntimePackages) {
      if (source.text.includes(packageName)) {
        failures.push({
          code: "removed-runtime-specifier-remains",
          subject: source.path,
          message: `${source.path} still references ${packageName}`
        })
      }
    }
  }

  const runtime = manifests.get("@wanex/runtime")
  if (runtime === undefined) {
    failures.push({
      code: "runtime-package-missing",
      subject: "@wanex/runtime",
      message: "the retained Runtime facade package is missing"
    })
    return failures
  }

  const dependencies = {
    ...(runtime.manifest.dependencies ?? {}),
    ...(runtime.manifest.optionalDependencies ?? {})
  }
  for (const dependency of forbiddenRuntimeDependencies) {
    if (dependencies[dependency] !== undefined) {
      failures.push({
        code: "runtime-forbidden-dependency",
        subject: dependency,
        message: `Runtime must not depend on upper or optional package ${dependency}`
      })
    }
  }
  return failures
}
