import {
  entryByName,
  runJsonAudit,
  type FootprintReport,
  type PacklistReport
} from "./distribution-audit.js"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const distributionColdFootprintPolicyScenario = createEvalScenario({
  id: "distribution.cold-footprint-policy",
  title: "Cold product entries stay free of plugin and connector closure",
  tags: ["distribution", "packaging", "product-path"],
  async run() {
    const report = await runJsonAudit<FootprintReport>(
      "audit-distribution-footprint.mjs",
      ["--json", "--enforce"]
    )
    assert(report.totals.failures === 0, "cold footprint audit should pass")
    assert(report.failures.length === 0, "cold footprint failures should be empty")

    const coldEntries = [
      entryByName(report, "@wanex/cli"),
      entryByName(report, "@wanex/runtime"),
      entryByName(report, "@wanex/app")
    ]

    for (const entry of coldEntries) {
      assert(entry.missing.length === 0, `${entry.entry} should exist`)
      assert(
        entry.contains.forbiddenPackages.length === 0,
        `${entry.entry} should not include forbidden plugin/connector closure`
      )
      assert(
        entry.contains.concreteAdapters.length === 0,
        `${entry.entry} should not include concrete adapters`
      )
      assert(
        entry.totals.fixtureFileCount === 0,
        `${entry.entry} should not include fixtures in its closure`
      )
    }

    return {
      coldEntries: coldEntries.map((entry) => ({
        entry: entry.entry,
        packageCount: entry.totals.packageCount,
        forbiddenPackages: entry.contains.forbiddenPackages,
        concreteAdapters: entry.contains.concreteAdapters
      }))
    }
  }
})

export const distributionPackagePacklistPolicyScenario = createEvalScenario({
  id: "distribution.package-packlist-policy",
  title: "Default package packlists exclude tests, fixtures, stores, and bundles",
  tags: ["distribution", "packaging", "release-gate"],
  async run() {
    const report = await runJsonAudit<PacklistReport>(
      "audit-package-packlist.mjs",
      ["--json"]
    )
    assert(report.totals.failures === 0, "package packlist audit should pass")
    assert(report.failures.length === 0, "packlist failures should be empty")

    const packagesWithForbiddenFiles = report.packages.filter(
      (item) => item.forbiddenFileCount > 0 || item.forbiddenFiles.length > 0
    )
    assert(
      packagesWithForbiddenFiles.length === 0,
      "default package packlists should not include forbidden files"
    )

    return {
      packages: report.totals.packages,
      packlistFiles: report.totals.packlistFiles,
      packlistBytes: report.totals.packlistBytes,
      failures: report.totals.failures
    }
  }
})

export const distributionHotPathCapabilityScenario = createEvalScenario({
  id: "distribution.hot-path-capability-contract",
  title:
    "Product paths expose optional runtimes only by explicit capability selection",
  tags: ["distribution", "packaging", "plugin", "product-path"],
  async run() {
    const report = await runJsonAudit<FootprintReport>(
      "audit-distribution-footprint.mjs",
      ["--json"]
    )
    const appFacade = entryByName(report, "@wanex/app")
    const productApp = entryByName(report, "@wanex/product-app")
    const productAppLocal = entryByName(report, "@wanex/product-app-local")
    const cli = entryByName(report, "@wanex/cli")

    assert(appFacade.missing.length === 0, "app should exist")
    assert(
      !appFacade.contains.pluginRuntime && !appFacade.contains.connectorRuntime,
      "app default path should stay slim and exclude optional runtimes"
    )
    assert(
      appFacade.contains.concreteAdapters.length === 0,
      "app should not include concrete connector adapters"
    )
    assert(productApp.missing.length === 0, "product app should exist")
    assert(
      !productApp.contains.pluginRuntime &&
        !productApp.contains.connectorRuntime,
      "product app should stay on the product app backend path"
    )
    assert(
      productApp.contains.concreteAdapters.length === 0,
      "product app should not include concrete connector adapters"
    )
    assert(
      productAppLocal.missing.length === 0,
      "product-app-local should exist"
    )
    assert(
      !productAppLocal.contains.pluginRuntime &&
        !productAppLocal.contains.connectorRuntime,
      "product-app-local should stay on the slim local Product App Web path"
    )
    assert(
      productAppLocal.contains.concreteAdapters.length === 0,
      "product-app-local should not include concrete connector adapters"
    )
    assert(
      !cli.contains.pluginRuntime && !cli.contains.connectorRuntime,
      "CLI cold path should not include optional runtimes"
    )
    return {
      app: {
        pluginRuntime: appFacade.contains.pluginRuntime,
        connectorRuntime: appFacade.contains.connectorRuntime,
        concreteAdapters: appFacade.contains.concreteAdapters
      },
      productApp: {
        pluginRuntime: productApp.contains.pluginRuntime,
        connectorRuntime: productApp.contains.connectorRuntime,
        concreteAdapters: productApp.contains.concreteAdapters
      },
      productAppLocal: {
        pluginRuntime: productAppLocal.contains.pluginRuntime,
        connectorRuntime: productAppLocal.contains.connectorRuntime,
        concreteAdapters: productAppLocal.contains.concreteAdapters
      },
      coldEntries: [cli.entry]
    }
  }
})
