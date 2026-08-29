import type { Terminal } from "@earendil-works/pi-tui"
import {
  type ProviderSetupInput
} from "@wanex/assistant"
import { TuiTrustedTerminalReader } from "../host/terminal-reader.js"
import { readTuiProviderSetup } from "./input.js"

export async function collectTuiProviderSetup(options: {
  readonly terminal: Terminal
  readonly signal?: AbortSignal
}): Promise<ProviderSetupInput & { readonly credential: string }> {
  const reader = new TuiTrustedTerminalReader({
    ...options,
    cancellationMessage: "Provider onboarding was cancelled"
  })
  reader.start()
  try {
    options.terminal.clearScreen()
    options.terminal.setTitle("Wanex Provider Setup")
    options.terminal.write("Wanex Provider Setup\r\n\r\n")
    const input = await readTuiProviderSetup(reader)
    options.terminal.write("Saving Provider configuration...\r\n")
    return input
  } finally {
    await reader.stop()
  }
}
