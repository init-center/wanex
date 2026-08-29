import { once } from "node:events"
import { chmod, lstat, unlink } from "node:fs/promises"
import { isAbsolute } from "node:path"
import {
  createConnection,
  createServer,
  type Server,
  type Socket
} from "node:net"
import {
  AGENT_HOST_MAX_FRAME_BYTES,
  isAgentHostServerMessage,
  type AgentHostClientMessage,
  type AgentHostClientTransport,
  type AgentHostEvent,
  type AgentHostServerMessage
} from "@wanex/protocol"
import type { InProcessAgentHostEndpoint } from "./agent-host.js"

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000
const MAX_UNIX_SOCKET_PATH_BYTES = 100
const MAX_WINDOWS_PIPE_NAME_BYTES = 240

export interface LocalAgentHostIpcServerOptions {
  readonly socketPath: string
  readonly createEndpoint: () => InProcessAgentHostEndpoint
  readonly maxFrameBytes?: number
}

export interface LocalAgentHostIpcServer {
  readonly socketPath: string
  close(): Promise<void>
}

export interface LocalAgentHostIpcClientOptions {
  readonly socketPath: string
  readonly maxFrameBytes?: number
  readonly connectTimeoutMs?: number
}

export interface LocalAgentHostIpcClientTransport
  extends AgentHostClientTransport {
  close(): Promise<void>
}

export async function listenLocalAgentHostIpc(
  options: LocalAgentHostIpcServerOptions
): Promise<LocalAgentHostIpcServer> {
  const maxFrameBytes = normalizeMaxFrameBytes(options.maxFrameBytes)
  validateIpcAddress(options.socketPath)
  const server = createServer()
  const sockets = new Set<Socket>()
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    attachServerConnection(socket, options.createEndpoint(), maxFrameBytes)
  })

  let bound = false
  try {
    await listenServer(server, options.socketPath)
    bound = true
    if (process.platform !== "win32") {
      await chmod(options.socketPath, 0o600)
      const mode = (await lstat(options.socketPath)).mode & 0o777
      if (mode !== 0o600) {
        throw new Error("local Agent Host IPC socket permissions are not private")
      }
    }
  } catch (error) {
    await closeServer(server, sockets, options.socketPath, bound)
    throw error
  }

  let closed = false
  return {
    socketPath: options.socketPath,
    async close() {
      if (closed) return
      closed = true
      await closeServer(server, sockets, options.socketPath, true)
    }
  }
}

export function createLocalAgentHostIpcClientTransport(
  options: LocalAgentHostIpcClientOptions
): LocalAgentHostIpcClientTransport {
  const maxFrameBytes = normalizeMaxFrameBytes(options.maxFrameBytes)
  validateIpcAddress(options.socketPath)
  const connectTimeoutMs = normalizeConnectTimeout(options.connectTimeoutMs)
  const listeners = new Set<(event: unknown) => void>()
  const pending = new Map<
    string,
    { readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void }
  >()
  let socket: Socket | undefined
  let connecting: Promise<Socket> | undefined
  let closed = false
  let handshakePending = false
  let writeTail = Promise.resolve()

  const transport: LocalAgentHostIpcClientTransport = {
    async send(request: AgentHostClientMessage): Promise<unknown> {
      if (closed) throw new Error("local Agent Host IPC client is closed")
      const key = request.kind === "wanex.agent-host.handshake.request"
        ? "__handshake__"
        : request.requestId
      if (key === undefined || pending.has(key) || (key === "__handshake__" && handshakePending)) {
        throw new Error("local Agent Host IPC request is already pending")
      }

      const response = new Promise<unknown>((resolve, reject) => {
        pending.set(key, { resolve, reject })
      })
      if (key === "__handshake__") handshakePending = true
      try {
        await writeMessage(await ensureConnection(), request)
      } catch (error) {
        settlePending(key, undefined, toError(error))
      }
      return await response
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close() {
      if (closed) return
      closed = true
      rejectPending(new Error("local Agent Host IPC client is closed"))
      const current = socket
      socket = undefined
      connecting = undefined
      if (current !== undefined && !current.destroyed) {
        current.destroy()
        await once(current, "close").catch(() => undefined)
      }
      listeners.clear()
    }
  }

  return Object.freeze(transport)

  async function ensureConnection(): Promise<Socket> {
    if (socket !== undefined && !socket.destroyed) return socket
    if (connecting !== undefined) return await connecting
    connecting = new Promise<Socket>((resolve, reject) => {
      const next = createConnection(options.socketPath)
      let settled = false
      const timer = setTimeout(() => {
        next.destroy()
        reject(new Error("local Agent Host IPC connection timed out"))
      }, connectTimeoutMs)
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      }
      next.once("connect", () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket = next
        attachClientSocket(next)
        resolve(next)
      })
      next.once("error", fail)
    }).finally(() => {
      connecting = undefined
    })
    return await connecting
  }

  function attachClientSocket(next: Socket): void {
    const decoder = new FrameDecoder(maxFrameBytes)
    next.on("data", (chunk: Buffer) => {
      try {
        for (const frame of decoder.push(chunk)) {
          const value: unknown = JSON.parse(frame.toString("utf8"))
          if (!isAgentHostServerMessage(value)) {
            throw new Error("local Agent Host IPC response is invalid")
          }
          routeServerMessage(value)
        }
      } catch (error) {
        failConnection(toError(error))
      }
    })
    next.on("close", () => {
      if (socket === next) socket = undefined
      failConnection(new Error("local Agent Host IPC connection closed"))
    })
    next.on("error", (error) => failConnection(error))
  }

  function routeServerMessage(message: AgentHostServerMessage): void {
    if (message.kind === "wanex.agent-host.event") {
      for (const listener of listeners) {
        try {
          listener(message)
        } catch {
          // One client listener cannot affect the shared IPC connection.
        }
      }
      return
    }
    const key = message.kind === "wanex.agent-host.handshake.response" ||
      (message.kind === "wanex.agent-host.error" &&
        message.requestId === undefined &&
        handshakePending)
      ? "__handshake__"
      : message.requestId
    if (key === undefined) {
      failConnection(new Error("local Agent Host IPC response has no request id"))
      return
    }
    settlePending(key, message)
  }

  function failConnection(error: Error): void {
    rejectPending(error)
    const current = socket
    if (current !== undefined && !current.destroyed) current.destroy()
  }

  function rejectPending(error: Error): void {
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    handshakePending = false
  }

  function settlePending(
    key: string,
    value: unknown,
    error?: Error
  ): void {
    const entry = pending.get(key)
    if (entry === undefined) return
    pending.delete(key)
    if (key === "__handshake__") handshakePending = false
    if (error !== undefined) entry.reject(error)
    else entry.resolve(value)
  }

  async function writeMessage(
    target: Socket,
    value: AgentHostClientMessage
  ): Promise<void> {
    const frame = encodeFrame(value, maxFrameBytes)
    const write = writeTail.then(async () => await writeFrame(target, frame))
    writeTail = write.catch(() => undefined)
    await write
  }
}

function attachServerConnection(
  socket: Socket,
  endpoint: InProcessAgentHostEndpoint,
  maxFrameBytes: number
): void {
  socket.setNoDelay(true)
  const decoder = new FrameDecoder(maxFrameBytes)
  let writeTail = Promise.resolve()
  let closed = false
  const unsubscribe = endpoint.subscribe((event) => {
    void sendMessage(event).catch(() => socket.destroy())
  })

  socket.on("data", (chunk: Buffer) => {
    try {
      for (const frame of decoder.push(chunk)) {
        let value: unknown
        try {
          value = JSON.parse(frame.toString("utf8"))
        } catch {
          void sendMessage({
            kind: "wanex.agent-host.error",
            error: {
              code: "malformed_request",
              message: "Agent Host frame is not valid JSON",
              retryable: false
            }
          })
          continue
        }
        void endpoint.send(value).then(sendMessage).catch(() => {
          void sendMessage({
            kind: "wanex.agent-host.error",
            error: {
              code: "transport_failure",
              message: "Agent Host IPC request failed",
              retryable: true
            }
          })
        })
      }
    } catch {
      void sendMessage({
        kind: "wanex.agent-host.error",
        error: {
          code: "resource_limit",
          message: "Agent Host IPC frame exceeds its limit",
          retryable: false
        }
      }).finally(() => socket.destroy())
    }
  })
  socket.on("close", () => close())
  socket.on("error", () => close())

  function close(): void {
    if (closed) return
    closed = true
    unsubscribe()
    endpoint.close()
  }

  function sendMessage(value: AgentHostServerMessage | AgentHostEvent): Promise<void> {
    if (closed || socket.destroyed) return Promise.resolve()
    let frame: Buffer
    try {
      frame = encodeFrame(value, maxFrameBytes)
    } catch (error) {
      return Promise.reject(toError(error))
    }
    const write = writeTail.then(async () => await writeFrame(socket, frame))
    writeTail = write.catch(() => undefined)
    return write
  }
}

function encodeFrame(value: object, maxFrameBytes: number): Buffer {
  const json = Buffer.from(JSON.stringify(value), "utf8")
  if (json.byteLength > maxFrameBytes) {
    throw new Error("Agent Host IPC frame exceeds its limit")
  }
  const frame = Buffer.allocUnsafe(json.byteLength + 4)
  frame.writeUInt32BE(json.byteLength, 0)
  json.copy(frame, 4)
  return frame
}

async function writeFrame(socket: Socket, frame: Buffer): Promise<void> {
  if (socket.destroyed) throw new Error("Agent Host IPC socket is closed")
  if (socket.write(frame)) return
  await new Promise<void>((resolve, reject) => {
    const onDrain = (): void => finish(undefined)
    const onClose = (): void => finish(new Error("Agent Host IPC socket closed"))
    const onError = (error: Error): void => finish(error)
    const finish = (error: Error | undefined): void => {
      socket.off("drain", onDrain)
      socket.off("close", onClose)
      socket.off("error", onError)
      if (error === undefined) resolve()
      else reject(error)
    }
    socket.once("drain", onDrain)
    socket.once("close", onClose)
    socket.once("error", onError)
  })
}

class FrameDecoder {
  #buffer = Buffer.alloc(0)

  constructor(private readonly maxFrameBytes: number) {}

  push(chunk: Buffer): Buffer[] {
    if (chunk.byteLength > this.maxFrameBytes + 4) {
      throw new Error("Agent Host IPC frame exceeds its limit")
    }
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    if (this.#buffer.byteLength > this.maxFrameBytes + 4) {
      throw new Error("Agent Host IPC frame exceeds its limit")
    }
    const frames: Buffer[] = []
    while (this.#buffer.byteLength >= 4) {
      const size = this.#buffer.readUInt32BE(0)
      if (size > this.maxFrameBytes) {
        throw new Error("Agent Host IPC frame exceeds its limit")
      }
      if (this.#buffer.byteLength < size + 4) break
      frames.push(this.#buffer.subarray(4, size + 4))
      this.#buffer = this.#buffer.subarray(size + 4)
    }
    return frames
  }
}

async function listenServer(server: Server, socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(socketPath)
  })
}

async function closeServer(
  server: Server,
  sockets: Set<Socket>,
  socketPath: string,
  unlinkSocket: boolean
): Promise<void> {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  for (const socket of sockets) sockets.delete(socket)
  if (unlinkSocket && process.platform !== "win32") {
    try {
      await unlink(socketPath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT") throw error
    }
  }
}

function normalizeMaxFrameBytes(value: number | undefined): number {
  if (value === undefined) return AGENT_HOST_MAX_FRAME_BYTES
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > AGENT_HOST_MAX_FRAME_BYTES
  ) {
    throw new Error(
      `Agent Host IPC max frame must be between 1 and ${AGENT_HOST_MAX_FRAME_BYTES} bytes`
    )
  }
  return value
}

function normalizeConnectTimeout(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 60_000)
    : DEFAULT_CONNECT_TIMEOUT_MS
}

function validateIpcAddress(address: string): void {
  if (process.platform === "win32") {
    const prefix = "\\\\.\\pipe\\"
    const name = address.startsWith(prefix) ? address.slice(prefix.length) : ""
    if (
      name.length === 0 ||
      name.length > MAX_WINDOWS_PIPE_NAME_BYTES ||
      Buffer.byteLength(address, "utf8") > MAX_WINDOWS_PIPE_NAME_BYTES ||
      !/^[A-Za-z0-9._-]+$/.test(name)
    ) {
      throw new Error(
        `Agent Host IPC named pipe must use \\\\.\\pipe\\<name> with a bounded safe name`
      )
    }
    return
  }
  if (
    !isAbsolute(address) ||
    address.length === 0 ||
    Buffer.byteLength(address, "utf8") > MAX_UNIX_SOCKET_PATH_BYTES
  ) {
    throw new Error(
      `Agent Host IPC socket path must contain 1 to ${MAX_UNIX_SOCKET_PATH_BYTES} UTF-8 bytes`
    )
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Agent Host IPC failed")
}
