import type {
  TuiCommandPaletteContribution,
  TuiNotificationContribution,
  TuiPromptDecorationContribution,
  TuiStatusItemContribution
} from "../surface/index.js"
import type {
  OptionalCommandResolver,
  RequiredCommandResolver
} from "./command-resolution.js"
import type {
  TuiShellKeybinding,
  TuiShellNotification,
  TuiShellPaletteEntry,
  TuiShellPanel,
  TuiShellPromptDecoration,
  TuiShellStatusItem,
  TuiShellTheme
} from "./types.js"
import type { BuildTuiShellReadModelRequest } from "./types.js"

export function paletteEntry(
  contribution: TuiCommandPaletteContribution,
  resolveCommand: RequiredCommandResolver
): TuiShellPaletteEntry {
  const command = resolveCommand(contribution.value.commandId, contribution.id)
  return {
    id: contribution.id,
    title: contribution.value.title || command.title || contribution.value.commandId,
    ...(contribution.value.description === undefined &&
    command.description === undefined
      ? {}
      : {
          description:
            contribution.value.description ?? command.description
        }),
    ...(contribution.value.category === undefined && command.category === undefined
      ? {}
      : { category: contribution.value.category ?? command.category }),
    aliases: contribution.value.aliases ?? [],
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    command:
      contribution.value.handlerRef === undefined
        ? command
        : {
            ...command,
            handlerRef: contribution.value.handlerRef
          },
    contribution
  }
}

export function keybinding(
  contribution: BuildTuiShellReadModelRequest["tui"]["byDomain"]["keybinding"]["all"][number],
  resolveCommand: RequiredCommandResolver
): TuiShellKeybinding {
  return {
    id: contribution.id,
    key: contribution.value.key,
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    ...(contribution.value.platform === undefined
      ? {}
      : { platform: contribution.value.platform }),
    command: resolveCommand(contribution.value.commandId, contribution.id),
    contribution
  }
}

export function panel(
  contribution: BuildTuiShellReadModelRequest["tui"]["byDomain"]["panel"]["all"][number]
): TuiShellPanel {
  return {
    id: contribution.id,
    panelId: contribution.value.panelId,
    title: contribution.value.title,
    placement: contribution.value.placement,
    componentRef: contribution.value.componentRef,
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    contribution
  }
}

export function statusItem(
  contribution: TuiStatusItemContribution,
  resolveCommand: OptionalCommandResolver
): TuiShellStatusItem {
  const command = resolveCommand(contribution.value.commandId, contribution.id)
  return {
    id: contribution.id,
    itemId: contribution.value.itemId,
    label: contribution.value.label,
    alignment: contribution.value.alignment,
    priority: contribution.value.priority ?? 0,
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    ...(command === undefined ? {} : { command }),
    contribution
  }
}

export function promptDecoration(
  contribution: TuiPromptDecorationContribution,
  resolveCommand: OptionalCommandResolver
): TuiShellPromptDecoration {
  const command = resolveCommand(contribution.value.commandId, contribution.id)
  return {
    id: contribution.id,
    decorationId: contribution.value.decorationId,
    placement: contribution.value.placement,
    ...(contribution.value.text === undefined
      ? {}
      : { text: contribution.value.text }),
    ...(contribution.value.icon === undefined
      ? {}
      : { icon: contribution.value.icon }),
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    ...(command === undefined ? {} : { command }),
    contribution
  }
}

export function theme(
  contribution: BuildTuiShellReadModelRequest["tui"]["byDomain"]["theme"]["all"][number]
): TuiShellTheme {
  return {
    id: contribution.id,
    themeId: contribution.value.themeId,
    displayName: contribution.value.displayName,
    colors: contribution.value.colors,
    contribution
  }
}

export function notification(
  contribution: TuiNotificationContribution,
  resolveCommand: OptionalCommandResolver
): TuiShellNotification {
  const command = resolveCommand(contribution.value.commandId, contribution.id)
  return {
    id: contribution.id,
    notificationId: contribution.value.notificationId,
    level: contribution.value.level,
    title: contribution.value.title,
    ...(contribution.value.message === undefined
      ? {}
      : { message: contribution.value.message }),
    ...(contribution.value.when === undefined
      ? {}
      : { when: contribution.value.when }),
    ...(command === undefined ? {} : { command }),
    contribution
  }
}
