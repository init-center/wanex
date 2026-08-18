import type { ShellOptions } from "@wanex/product";
import type { StorageHandle } from "@wanex/storage";

export interface LocalPluginCompositionPort {
  prepare(
    request: LocalPluginCompositionPrepareRequest,
  ): Promise<LocalPluginCompositionBinding>;
}

export interface LocalPluginCompositionPrepareRequest {
  readonly handle: Pick<StorageHandle, "core" | "transport">;
}

export interface LocalPluginCompositionBinding {
  readonly productBinding: {
    readonly extensions: NonNullable<ShellOptions["extensions"]>;
    readonly productCommands: NonNullable<ShellOptions["productCommands"]>;
    readonly pluginManagement?: NonNullable<ShellOptions["pluginManagement"]>;
  };
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
