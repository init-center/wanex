export function findFacadeFootprintViolations({ report, baseline }) {
  const failures = []
  if (report.esbuildVersion !== baseline.esbuildVersion) {
    failures.push({
      code: "facade-footprint-tool-version-drift",
      facade: "*",
      message: `expected esbuild ${baseline.esbuildVersion}, received ${report.esbuildVersion}`
    })
  }

  for (const [name, expected] of Object.entries(baseline.facades ?? {})) {
    const actual = report.facades[name]
    if (actual === undefined) {
      failures.push({
        code: "missing-facade-footprint",
        facade: name,
        message: "facade footprint report is missing"
      })
      continue
    }
    if (actual.outputBytes > expected.maxOutputBytes) {
      failures.push({
        code: "facade-output-byte-growth",
        facade: name,
        message: `${actual.outputBytes} bytes exceeds baseline ${expected.maxOutputBytes}`
      })
    }
    if (actual.inputCount > expected.maxInputCount) {
      failures.push({
        code: "facade-static-input-growth",
        facade: name,
        message: `${actual.inputCount} inputs exceeds baseline ${expected.maxInputCount}`
      })
    }

    const allowed = new Set(expected.allowedWorkspacePackages ?? [])
    for (const packageName of actual.workspacePackages) {
      if (!allowed.has(packageName)) {
        failures.push({
          code: "unreviewed-facade-workspace-package",
          facade: name,
          package: packageName,
          message: `${packageName} is not in the reviewed static facade closure`
        })
      }
    }
    for (const packageName of actual.workspacePackages) {
      if ((baseline.forbiddenWorkspacePackages ?? []).includes(packageName)) {
        failures.push({
          code: "forbidden-facade-workspace-package",
          facade: name,
          package: packageName,
          message: `${packageName} is optional or product-owned and must be absent from default facades`
        })
      }
    }
  }

  return failures
}
