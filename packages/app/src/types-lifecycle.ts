export interface WanexAppShellLifecycleCommands {
  shutdown(): Promise<WanexAppShellShutdownResult>
}

export interface WanexAppShellShutdownResult {
  readonly disposed: boolean
  readonly repeated: boolean
}
