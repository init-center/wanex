import { join } from "node:path";
import {
  createPluginCommandComposition,
  type PluginCommandCompositionPort,
} from "@wanex/plugin-command-host";

export interface NativeDirectorySelectionResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

export interface DesktopExtensionCompositionOptions {
  readonly userDataDir: string;
  readonly selectLocalPackage: () => Promise<string | undefined>;
}

export function createDesktopExtensionComposition(
  options: DesktopExtensionCompositionOptions,
): PluginCommandCompositionPort {
  return createPluginCommandComposition({
    principalId: "desktop-plugin-actions",
    worker: {
      workerId: "desktop-plugin-worker",
      leaseMs: 30_000,
      heartbeatIntervalMs: 10_000,
      timeoutMs: 5 * 60_000,
    },
    management: {
      installBaseDir: extensionInstallBaseDir(options.userDataDir),
      actorId: "desktop-local-user",
      selectLocalPackage: options.selectLocalPackage,
    },
  });
}

export function extensionInstallBaseDir(userDataDir: string): string {
  const normalized = userDataDir.trim();
  if (normalized.length === 0) {
    throw new Error("Desktop user-data directory must not be empty");
  }
  return join(normalized, "extensions");
}

export async function selectLocalExtensionDirectory(
  openDirectory: () => Promise<NativeDirectorySelectionResult>,
): Promise<string | undefined> {
  const result = await openDirectory();
  if (result.canceled || result.filePaths.length === 0) return undefined;
  if (result.filePaths.length !== 1) {
    throw new Error("Desktop extension selection must contain one directory");
  }
  const selected = result.filePaths[0]?.trim();
  if (selected === undefined || selected.length === 0) {
    throw new Error("Desktop extension selection returned an empty directory");
  }
  return selected;
}
