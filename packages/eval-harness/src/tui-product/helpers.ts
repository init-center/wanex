import type { AppCommandContribution } from "@wanex/extension"
import type {
  TuiCommandPaletteContribution,
  TuiKeybindingContribution,
  TuiStatusItemContribution
} from "@wanex/product-app-tui/contributions"
import { assert, isRecord } from "../scenario-utils.js"

type CompletedBridgeCandidate =
  | {
      readonly status: "completed"
      readonly value?: unknown
    }
  | {
      readonly status: string
      readonly value?: unknown
    }

export function commandContribution(options: {
  readonly id: string
  readonly title: string
  readonly handlerRef: string
  readonly trust?: AppCommandContribution["provenance"]["trust"]
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.id,
      title: options.title,
      handlerRef: options.handlerRef
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: options.trust ?? "trusted"
    }
  }
}

export function paletteContribution(options: {
  readonly id: string
  readonly commandId: string
  readonly title: string
}): TuiCommandPaletteContribution {
  return {
    id: options.id,
    domain: "command_palette",
    value: {
      commandId: options.commandId,
      title: options.title
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

export function keybindingContribution(options: {
  readonly id: string
  readonly commandId: string
  readonly key: string
  readonly platform: NonNullable<TuiKeybindingContribution["value"]["platform"]>
  readonly when: string
}): TuiKeybindingContribution {
  return {
    id: options.id,
    domain: "keybinding",
    value: {
      commandId: options.commandId,
      key: options.key,
      platform: options.platform,
      when: options.when
    },
    provenance: {
      source: {
        kind: "project_config",
        scope: "project",
        id: "project-tui"
      },
      trust: "user_enabled"
    }
  }
}

export function statusContribution(options: {
  readonly id: string
  readonly commandId: string
}): TuiStatusItemContribution {
  return {
    id: options.id,
    domain: "status_item",
    value: {
      itemId: options.id,
      label: "Diagnostics",
      alignment: "left",
      commandId: options.commandId
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

export function expectCompletedBridgeValue(
  result: CompletedBridgeCandidate,
  appCommand: string
): Readonly<Record<string, unknown>> {
  assert(result.status === "completed", `${appCommand} should complete`)
  const bridgeResult = result.value
  assert(isRecord(bridgeResult), `${appCommand} bridge result must be an object`)
  assert(
    bridgeResult.appCommand === appCommand,
    `${appCommand} bridge result should name the App Shell command`
  )
  assert(
    isRecord(bridgeResult.value),
    `${appCommand} App Shell result must be an object`
  )
  return bridgeResult.value
}

export function expectReadonlyArray(value: unknown): readonly unknown[] {
  assert(Array.isArray(value), "expected array value")
  return value
}

export function expectBridgeStringField(
  result: CompletedBridgeCandidate,
  key: string
): string {
  assert(result.status === "completed", "bridge result should complete")
  assert(isRecord(result.value), "bridge result must be an object")
  return expectStringField(result.value, key)
}

export function expectStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key]
  assert(typeof value === "string", `${key} should be a string`)
  return value
}

export function expectNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number {
  const value = record[key]
  assert(typeof value === "number", `${key} should be a number`)
  return value
}
