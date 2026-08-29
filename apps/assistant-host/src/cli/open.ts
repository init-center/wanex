import { spawn } from "node:child_process"
import type { SpawnOptions } from "node:child_process"

export interface LocalBrowserOpenCommand {
  readonly command: string
  readonly args: readonly string[]
}

export interface OpenLocalBrowserOptions {
  readonly url: string
  readonly platform?: NodeJS.Platform
  readonly spawn?: LocalSpawn
}

export type LocalSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => LocalSpawnedProcess

export interface LocalSpawnedProcess {
  once(event: "error", listener: (error: Error) => void): unknown
  unref(): unknown
}

export type OpenLocalBrowserResult =
  | {
      readonly ok: true
      readonly command: LocalBrowserOpenCommand
    }
  | {
      readonly ok: false
      readonly error: Error
    }

export function openLocalBrowser(
  options: OpenLocalBrowserOptions
): OpenLocalBrowserResult {
  try {
    const command = createLocalBrowserOpenCommand({
      url: options.url,
      platform: options.platform ?? process.platform
    })
    const child = (options.spawn ?? spawn)(
      command.command,
      command.args,
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }
    )
    child.once("error", () => undefined)
    child.unref()
    return {
      ok: true,
      command
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

export function createLocalBrowserOpenCommand(input: {
  readonly url: string
  readonly platform: NodeJS.Platform
}): LocalBrowserOpenCommand {
  const url = normalizeLocalBrowserUrl(input.url)
  switch (input.platform) {
    case "darwin":
      return {
        command: "open",
        args: [url]
      }
    case "win32":
      return {
        command: "cmd",
        args: ["/c", "start", "", url]
      }
    default:
      return {
        command: "xdg-open",
        args: [url]
      }
  }
}

function normalizeLocalBrowserUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported browser URL protocol: ${parsed.protocol}`)
  }
  return parsed.href
}
