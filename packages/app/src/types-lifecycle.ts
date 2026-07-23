export interface WanexAppLifecycleCommands {
  shutdown(): Promise<WanexAppShutdownResult>
}

export interface WanexAppShutdownResult {
  readonly disposed: boolean
  readonly repeated: boolean
}
