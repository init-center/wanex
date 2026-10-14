import { isDeepStrictEqual } from "node:util"

export function evaluateFacadeFootprint({ report, baseline }) {
  const failures = []
  const toolMatches = report.esbuildVersion === baseline.esbuildVersion
  const optionsMatch = isDeepStrictEqual(report.buildOptions, baseline.buildOptions)
  const comparable = toolMatches && optionsMatch
  const notices = toolMatches ? [] : [{
      code: "facade-footprint-tool-version-drift",
      message: `baseline esbuild ${baseline.esbuildVersion}, current ${report.esbuildVersion}; measurements are not directly comparable`
  }]
  if (!optionsMatch) notices.push({
    code: "facade-footprint-build-options-drift",
    message: "build parameters changed; measurements are not directly comparable"
  })
  const changes = {}

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
    changes[name] = {
      outputBytesDelta: comparable ? actual.outputBytes - expected.outputBytes : null,
      inputCountDelta: comparable ? actual.inputCount - expected.inputCount : null
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

  return { failures, notices, comparison: { comparable, changes } }
}

export function refreshFacadeMeasurements({ report, baseline }) {
  const { failures } = evaluateFacadeFootprint({ report, baseline })
  if (failures.length > 0) {
    throw new Error(`cannot refresh facade measurements with boundary violations: ${failures.map(failure => failure.code).join(", ")}`)
  }
  return {
    ...baseline,
    esbuildVersion: report.esbuildVersion,
    buildOptions: report.buildOptions,
    facades: Object.fromEntries(Object.entries(baseline.facades).map(([name, expected]) => [
      name, { ...expected, outputBytes: report.facades[name].outputBytes,
        inputCount: report.facades[name].inputCount }
    ]))
  }
}
