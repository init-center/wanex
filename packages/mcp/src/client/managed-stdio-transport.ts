import {
  ReadBuffer,
  serializeMessage
} from "@modelcontextprotocol/sdk/shared/stdio.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import type { ManagedExecutionProcess } from "@wanex/runtime/execution"
import type { WanexMcpStdioClientTransportConfig } from "./types.js"

const DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024
const STDERR_CAPTURE_BYTES = 64 * 1024

/**
 * MCP stdio framing over a Wanex-owned managed process. The borrowed execution
 * scope remains owned by the trusted Host; this transport owns only the child.
 */
export class WanexManagedStdioClientTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  readonly #config: WanexMcpStdioClientTransportConfig
  readonly #readBuffer: ReadBuffer
  #process: ManagedExecutionProcess | undefined
  #pump: Promise<void> | undefined
  #closePromise: Promise<void> | undefined
  #closeNotified = false

  constructor(config: WanexMcpStdioClientTransportConfig) {
    this.#config = config
    this.#readBuffer = new ReadBuffer({
      maxBufferSize: config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE
    })
  }

  async start(): Promise<void> {
    if (
      this.#process !== undefined ||
      this.#pump !== undefined ||
      this.#closePromise !== undefined
    ) {
      throw new Error("MCP managed stdio transport is already started")
    }
    const process = await this.#config.execution.process.start({
      program: this.#config.command,
      ...(this.#config.args === undefined ? {} : { args: this.#config.args }),
      cwd: this.#config.cwd,
      ...(this.#config.env === undefined
        ? {}
        : { environment: this.#config.env }),
      output: {
        stdoutBytes: this.#config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
        stderrBytes: STDERR_CAPTURE_BYTES
      }
    })
    this.#process = process
    this.#pump = this.#pumpEvents(process)
    void this.#pump.catch((error) => this.#notifyError(error))
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const process = this.#process
    if (process === undefined) throw new Error("MCP managed stdio transport is not connected")
    await process.write(serializeMessage(message))
  }

  close(): Promise<void> {
    const process = this.#process
    return process === undefined
      ? this.#beginCloseWithoutProcess()
      : this.#beginProcessClose(process, true)
  }

  #beginCloseWithoutProcess(): Promise<void> {
    this.#closePromise ??= this.#settleWithoutProcess()
    return this.#closePromise
  }

  #beginProcessClose(
    process: ManagedExecutionProcess,
    terminate: boolean
  ): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise
    if (this.#process === process) this.#process = undefined
    this.#closePromise = this.#settleProcess(process, terminate)
    return this.#closePromise
  }

  async #settleWithoutProcess(): Promise<void> {
    this.#readBuffer.clear()
    this.#notifyClose()
  }

  async #settleProcess(
    process: ManagedExecutionProcess,
    terminate: boolean
  ): Promise<void> {
    let failure: unknown
    try {
      if (terminate) {
        try {
          await process.terminate("cancelled")
        } catch (error) {
          failure = error
        }
      }
      try {
        const result = await process.wait()
        if (result.cleanup !== "completed") {
          failure ??= new Error("MCP managed stdio process cleanup was not completed")
        }
      } catch (error) {
        failure ??= error
      }
    } finally {
      this.#readBuffer.clear()
      this.#notifyClose()
    }
    if (failure !== undefined) throw failure
  }

  async #pumpEvents(process: ManagedExecutionProcess): Promise<void> {
    try {
      for await (const event of process.events) {
        if (event.type === "stdout") {
          this.#acceptOutput(event.bytes)
          continue
        }
        if (event.type === "terminal") {
          void this.#beginProcessClose(process, false)
            .catch((error) => this.#notifyError(error))
          return
        }
      }
    } catch (error) {
      this.#notifyError(error)
    } finally {
      if (this.#process === process) {
        void this.#beginProcessClose(process, true)
          .catch((error) => this.#notifyError(error))
      }
    }
  }

  #acceptOutput(bytes: Uint8Array): void {
    try {
      this.#readBuffer.append(Buffer.from(bytes))
      while (true) {
        const message = this.#readBuffer.readMessage()
        if (message === null) return
        this.onmessage?.(message)
      }
    } catch (error) {
      this.#notifyError(error)
      void this.close().catch((closeError) => this.#notifyError(closeError))
    }
  }

  #notifyClose(): void {
    if (this.#closeNotified) return
    this.#closeNotified = true
    this.onclose?.()
  }

  #notifyError(error: unknown): void {
    this.onerror?.(error instanceof Error ? error : new Error(String(error)))
  }
}
