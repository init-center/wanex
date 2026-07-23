import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { ProductAppWebController } from "@wanex/product-app-web"
import type { ProductAppLocalAttachmentUploadPort } from "../attachment-upload.js"

export interface ProductAppWebNodeRequestHandlerOptions {
  readonly controller: ProductAppWebController
  readonly attachments: ProductAppLocalAttachmentUploadPort
  readonly requestPath?: string
  readonly clientScriptPath?: string
  readonly stylesheetPath?: string
  readonly maxBodyBytes?: number
  readonly attachmentPath?: string
  readonly maxAttachmentBytes?: number
  readonly pollIntervalMs?: number
}

export type ProductAppWebNodeRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => void

export interface ListenProductAppWebNodeHostOptions
  extends ProductAppWebNodeRequestHandlerOptions {
  readonly hostname?: string
  readonly port?: number
}

export interface ProductAppWebNodeHostServer {
  readonly server: Server
  readonly url: string
  close(): Promise<void>
}
