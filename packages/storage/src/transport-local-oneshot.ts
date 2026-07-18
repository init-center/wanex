import type { StorageRpcRequestEnvelope } from "./generated/storage-rpc.js"
import { runJsonCommand } from "./transport-local-command.js"
import type {
  StorageWireTransport,
  SystemServiceTransportOptions
} from "./transport-types.js"

export class OneShotSystemServiceStorageWireTransport implements StorageWireTransport {
  readonly storeDir: string
  readonly serviceBin: string

  constructor(options: SystemServiceTransportOptions) {
    this.storeDir = options.storeDir
    this.serviceBin = options.serviceBin
  }

  exchange(request: StorageRpcRequestEnvelope): Promise<unknown> {
    return runJsonCommand(this.serviceBin, this.storeDir, request)
  }
}
