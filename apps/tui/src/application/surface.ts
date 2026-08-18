import { tuiDiagnostics } from "../presentation/model.js"
import type {
  CreateTuiSurfaceOptions,
  TuiSurface,
  TuiSurfaceSnapshot
} from "../model.js"

export async function createTuiSurface(
  options: CreateTuiSurfaceOptions
): Promise<TuiSurface> {
  const now = options.now ?? Date.now
  let snapshot = await readSnapshot(options, now, options.homeOptions)

  return {
    client: options.client,
    snapshot() {
      return snapshot
    },
    async refresh(refreshOptions) {
      snapshot = await readSnapshot(
        options,
        now,
        refreshOptions ?? options.homeOptions
      )
      return snapshot
    }
  }
}

async function readSnapshot(
  options: CreateTuiSurfaceOptions,
  now: () => number,
  homeOptions: CreateTuiSurfaceOptions["homeOptions"]
): Promise<TuiSurfaceSnapshot> {
  const [descriptor, status, home, settings, commandCatalog, conversation, goal, events] = await Promise.all([
    options.client.descriptor(),
    options.client.status(),
    options.client.readHome(homeOptions),
    options.client.readSettings(),
    options.client.readProductCommands(),
    options.client.readTrackedConversationOperation(),
    options.client.readGoal(),
    options.client.readSurfaceEvents({ limit: options.eventLimit ?? 20 })
  ])
  const base = {
    kind: "tui.snapshot" as const,
    generatedAt: now(),
    descriptor,
    status,
    home,
    settings,
    commandCatalog,
    conversation,
    goal,
    events,
    diagnostics: tuiDiagnostics({
      descriptor,
      status,
      home,
      settings,
      commandCatalog,
      conversation,
      goal,
      events
    })
  }
  return base
}
