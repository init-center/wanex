import { isAbsolute, join } from "node:path";
import { createTrustedSubprocessPluginActionHostFromInstall } from "@wanex/plugin";
import {
  createAssistantPluginComposition,
  type AssistantPluginCompositionPort,
  type PluginActionHostFactory,
} from "@wanex/assistant-plugin-host";

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
): AssistantPluginCompositionPort {
  return createExtensionComposition(options);
}

export function createDesktopExtensionProofComposition(options: {
  readonly proofEnabled: boolean;
  readonly userDataDir: string;
  readonly selectLocalPackage: () => Promise<string | undefined>;
  readonly failHostCreationOnce: {
    readonly pluginId: string;
    readonly version: string;
  };
}): AssistantPluginCompositionPort {
  if (!options.proofEnabled) {
    throw new Error("Desktop extension host failure requires proof mode");
  }
  let failurePending = true;
  const createActionHost: PluginActionHostFactory = async (request) => {
    if (
      failurePending &&
      request.install.pluginId === options.failHostCreationOnce.pluginId &&
      request.install.version === options.failHostCreationOnce.version
    ) {
      failurePending = false;
      throw new Error("proof-injected Plugin execution host load failure");
    }
    return createTrustedSubprocessPluginActionHostFromInstall({
      manifest: request.manifest,
      install: request.install,
      executionEnvironment: request.executionEnvironment,
    });
  };
  return createExtensionComposition(options, createActionHost);
}

function createExtensionComposition(
  options: DesktopExtensionCompositionOptions,
  createActionHost?: PluginActionHostFactory,
): AssistantPluginCompositionPort {
  return createAssistantPluginComposition({
    principalId: "desktop-plugin-actions",
    ...(createActionHost === undefined ? {} : { createActionHost }),
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
