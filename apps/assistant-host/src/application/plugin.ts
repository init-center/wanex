import type { ShellOptions } from "@wanex/assistant";
import type { StorageHandle } from "@wanex/storage";
import type { ExecutionEnvironment } from "@wanex/runtime/execution";

export interface LocalPluginCompositionPort {
  prepare(
    request: LocalPluginCompositionPrepareRequest,
  ): Promise<LocalPluginCompositionBinding>;
}

export interface LocalPluginCompositionPrepareRequest {
  readonly handle: Pick<StorageHandle, "core" | "transport">;
  readonly executionEnvironment: ExecutionEnvironment;
}

export interface LocalPluginCompositionBinding {
  readonly assistantBinding: {
    readonly extensions: NonNullable<ShellOptions["extensions"]>;
    readonly assistantCommands: NonNullable<ShellOptions["assistantCommands"]>;
    readonly pluginManagement?: NonNullable<ShellOptions["pluginManagement"]>;
  };
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
