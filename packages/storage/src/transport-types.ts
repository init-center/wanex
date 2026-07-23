import type { ChildProcessWithoutNullStreams } from "node:child_process"
import type {
  StorageRpcCommand,
  StorageRpcRequestEnvelope,
  StorageRpcErrorEnvelope,
  StorageRpcSuccessEnvelope
} from "./generated/storage-rpc.js"

export interface StorageTransport {
  call(
    request: StorageRpcCommand
  ): Promise<StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope>
  close?(): Promise<void>
}

export interface StorageWireTransport {
  exchange(request: StorageRpcRequestEnvelope): Promise<unknown>
  connectionEpoch?(): number | null
  close?(): Promise<void>
}

export interface HttpStorageWireTransportOptions {
  readonly endpoint: string
  readonly token: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

export interface StorageProtocolTransportOptions {
  readonly negotiation: "oneshot" | "persistent" | "remote"
  readonly createRequestId?: () => string
}

export interface SystemServiceTransportOptions {
  readonly storeDir: string
  readonly serviceBin: string
  readonly serviceArgsPrefix?: readonly string[]
}

export interface PersistentSystemServiceTransportOptions
  extends SystemServiceTransportOptions {
  readonly restartBackoffMs?: number
  readonly sleep?: (ms: number) => Promise<void>
  readonly startupTimeoutMs?: number
  readonly requestTimeoutMs?: number
  readonly shutdownGraceMs?: number
  readonly cleanupTimeoutMs?: number
  readonly platform?: NodeJS.Platform
  readonly processTreeTerminator?: StorageProcessTreeTerminator
}

export interface StorageProcessTreeTerminationRequest {
  readonly child: ChildProcessWithoutNullStreams
  readonly platform: NodeJS.Platform
  readonly graceMs: number
  readonly waitForClose: (timeoutMs: number) => Promise<boolean>
}

export interface StorageProcessTreeTerminator {
  terminate(request: StorageProcessTreeTerminationRequest): Promise<void>
}
