import { isAbsolute, join } from "node:path";
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

export function createDesktopExtensionProofSelectionQueue(options: {
  readonly proofEnabled: boolean;
  readonly serializedSelections: string | undefined;
}): (() => Promise<string | undefined>) | undefined {
  const { serializedSelections } = options;
  if (!options.proofEnabled) {
    if (serializedSelections !== undefined) {
      throw new Error("Desktop extension proof selections require proof mode");
    }
    return undefined;
  }
  if (serializedSelections === undefined) return undefined;
  if (Buffer.byteLength(serializedSelections, "utf8") > 16_384) {
    throw new Error("Desktop extension proof selections exceed 16384 bytes");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedSelections);
  } catch {
    throw new Error("Desktop extension proof selections must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 8) {
    throw new Error("Desktop extension proof selections must contain 1 to 8 paths");
  }
  const selections = parsed.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Desktop extension proof selection must be a string");
    }
    const path = value.trim();
    if (path.length === 0 || path.includes("\0") || !isAbsolute(path)) {
      throw new Error("Desktop extension proof selection must be an absolute path");
    }
    return path;
  });
  let index = 0;
  return async () => {
    const selected = selections[index];
    if (selected === undefined) {
      throw new Error("Desktop extension proof selection queue is exhausted");
    }
    index += 1;
    return selected;
  };
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
