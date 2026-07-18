import type { TuiShellKeybinding } from "../shell-core/index.js"
import type {
  TuiShellContext,
  TuiShellControllerOptions
} from "./types.js"

export function isEnabled(
  expression: string | undefined,
  options: Pick<TuiShellControllerOptions, "evaluateWhen">,
  context: TuiShellContext | undefined
): boolean {
  if (expression === undefined) {
    return true
  }
  return options.evaluateWhen?.({
    expression,
    context: context ?? {}
  }) ?? true
}

export function platformMatches(
  keybinding: TuiShellKeybinding,
  platform: TuiShellKeybinding["platform"] | undefined
): boolean {
  if (keybinding.platform === undefined || keybinding.platform === "all") {
    return true
  }
  return platform === keybinding.platform
}
