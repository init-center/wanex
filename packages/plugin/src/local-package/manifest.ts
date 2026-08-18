import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { join } from "node:path"
import { pluginPackageLayoutFromJson } from "../codec-layout.js"
import { expectJsonValue } from "../internal-validation.js"
import type { PluginPackageLayout } from "../types-package.js"
import type { LocalPluginPackageLimits } from "./types.js"

export const LOCAL_PLUGIN_MANIFEST_FILE = "wanex.plugin.json" as const

export interface LocalPluginManifestRead {
  readonly sourceDir: string
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly layout: PluginPackageLayout
}

export async function readLocalPluginManifest(
  sourceDir: string,
  limits: LocalPluginPackageLimits
): Promise<LocalPluginManifestRead> {
  const root = await realpath(sourceDir)
  const handle = await openNoFollow(join(root, LOCAL_PLUGIN_MANIFEST_FILE))
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) {
      throw new Error("local plugin manifest must be a regular file")
    }
    if (stat.size > limits.maxManifestBytes) {
      throw new Error(
        `local plugin manifest exceeds ${limits.maxManifestBytes} bytes`
      )
    }
    if (process.platform !== "win32" && (stat.mode & 0o111) !== 0) {
      throw new Error("local plugin manifest must not be executable")
    }
    const bytes = await handle.readFile()
    if (bytes.byteLength !== stat.size) {
      throw new Error("local plugin manifest changed while being read")
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(bytes.toString("utf8"))
    } catch {
      throw new Error("local plugin manifest must contain valid JSON")
    }
    const layout = pluginPackageLayoutFromJson(
      expectJsonValue(parsed, "local plugin manifest")
    )
    return {
      sourceDir: root,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      layout
    }
  } finally {
    await handle.close()
  }
}

async function openNoFollow(path: string) {
  const noFollow = typeof constants.O_NOFOLLOW === "number"
    ? constants.O_NOFOLLOW
    : 0
  try {
    return await open(path, constants.O_RDONLY | noFollow)
  } catch (error) {
    if (isCode(error, "ELOOP")) {
      throw new Error("local plugin manifest must not be a symbolic link")
    }
    throw error
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
