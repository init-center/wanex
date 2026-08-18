import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Controller } from "@wanex/web";
import type { SurfaceClient } from "@wanex/product/surface";
import type { LocalAttachmentUploadPort } from "../resources/attachment.js";
import type { LocalResourceDeliveryPort } from "../resources/delivery.js";
import type {
  LocalCapabilitySetupCommands,
  LocalModelCatalogCommands,
  LocalProviderCommands,
} from "../model.js";
import type { WebWindowChrome } from "./window-chrome.js";

export type { WebWindowChrome } from "./window-chrome.js";

export interface WebNodeRequestHandlerOptions {
  readonly controller: Controller;
  readonly surfaceEvents: Pick<
    SurfaceClient,
    "readSurfaceEvents" | "subscribeSurfaceEvents"
  >;
  readonly attachments: LocalAttachmentUploadPort;
  readonly resourceDeliveries: LocalResourceDeliveryPort;
  /** Present only for the trusted local Product composition. */
  readonly providers?: LocalProviderCommands;
  /** Fixed-source metadata refresh, owned by the trusted local Host. */
  readonly modelCatalog?: LocalModelCatalogCommands;
  /** Present only for trusted local capability setup and linked continuation. */
  readonly capabilitySetup?: LocalCapabilitySetupCommands;
  readonly windowChrome?: WebWindowChrome;
  readonly requestPath?: string;
  readonly maxBodyBytes?: number;
  readonly attachmentPath?: string;
  readonly resourceDeliveryPreparePath?: string;
  readonly resourceDeliveryPath?: string;
  readonly eventStreamPath?: string;
  readonly maxAttachmentBytes?: number;
}

export interface WebNodeRequestHandler {
  (request: IncomingMessage, response: ServerResponse): void;
  closeActiveStreams(): void;
}

export interface ListenWebNodeHostOptions extends WebNodeRequestHandlerOptions {
  readonly hostname?: string;
  readonly port?: number;
}

export interface WebNodeHostServer {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}
