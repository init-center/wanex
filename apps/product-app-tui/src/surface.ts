import { createTuiShellController } from "./tui/shell/index.js"
import { buildProductAppTuiReadModel } from "./contributions.js"
import { createProductAppTuiCommandExecutor } from "./executor.js"
import { productAppTuiDiagnostics } from "./read-model.js"
import type {
  CreateProductAppTuiSurfaceOptions,
  ProductAppTuiSurface,
  ProductAppTuiSurfaceSnapshot
} from "./types.js"

export async function createProductAppTuiSurface(
  options: CreateProductAppTuiSurfaceOptions
): Promise<ProductAppTuiSurface> {
  const now = options.now ?? Date.now
  let snapshot = await readSnapshot(options, now, options.homeOptions)
  const controller = createTuiShellController({
    readModel: snapshot.readModel,
    executeCommand: createProductAppTuiCommandExecutor(options.client),
    ...(options.evaluateWhen === undefined
      ? {}
      : { evaluateWhen: options.evaluateWhen }),
    ...(options.emit === undefined ? {} : { emit: options.emit })
  })

  return {
    client: options.client,
    controller,
    snapshot() {
      return snapshot
    },
    readModel() {
      return snapshot.readModel
    },
    async refresh(refreshOptions) {
      snapshot = await readSnapshot(
        options,
        now,
        refreshOptions ?? options.homeOptions
      )
      controller.replaceReadModel(snapshot.readModel)
      return snapshot
    }
  }
}

async function readSnapshot(
  options: CreateProductAppTuiSurfaceOptions,
  now: () => number,
  homeOptions: CreateProductAppTuiSurfaceOptions["homeOptions"]
): Promise<ProductAppTuiSurfaceSnapshot> {
  const [descriptor, status, home, settings, commandCatalog, events] = await Promise.all([
    options.client.descriptor(),
    options.client.status(),
    options.client.readHome(homeOptions),
    options.client.readSettings(),
    options.client.readProductCommands(),
    options.client.readSurfaceEvents({ limit: options.eventLimit ?? 20 })
  ])
  const base = {
    kind: "product-app-tui.snapshot" as const,
    generatedAt: now(),
    descriptor,
    status,
    home,
    settings,
    commandCatalog,
    events,
    diagnostics: productAppTuiDiagnostics({
      descriptor,
      status,
      home,
      settings,
      commandCatalog,
      events
    })
  }
  const { readModel, contributions } = buildProductAppTuiReadModel(base)
  return {
    ...base,
    readModel,
    contributions
  }
}
