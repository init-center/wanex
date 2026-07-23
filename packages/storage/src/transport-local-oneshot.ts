import type { StorageRpcRequestEnvelope } from "./generated/storage-rpc.js"
import { runJsonCommand } from "./transport-local-command.js"
import type {
  StorageWireTransport,
  SystemServiceTransportOptions
} from "./transport-types.js"

export class OneShotSystemServiceStorageWireTransport implements StorageWireTransport {
  readonly storeDir: string
  readonly serviceBin: string
  private readonly serviceArgsPrefix: readonly string[]

  constructor(options: SystemServiceTransportOptions) {
    this.storeDir = options.storeDir
    this.serviceBin = options.serviceBin
    this.serviceArgsPrefix = [...(options.serviceArgsPrefix ?? [])]
  }

  exchange(request: StorageRpcRequestEnvelope): Promise<unknown> {
    return runJsonCommand(
      this.serviceBin,
      this.serviceArgsPrefix,
      this.storeDir,
      request
    )
  }
}
