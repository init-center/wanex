export interface CommandCatalogInvalidatedEvent {
  readonly kind: "product.command-catalog.invalidated"
  readonly sequence: number
  readonly at: number
  readonly revision: string
}

export type CommandCatalogEventListener = (
  event: CommandCatalogInvalidatedEvent
) => void

export type CommandCatalogEventUnsubscribe = () => void

export interface CommandCatalogEvents {
  subscribeCommandCatalogEvents(
    listener: CommandCatalogEventListener
  ): CommandCatalogEventUnsubscribe
}

export interface CommandExecutionJobReference {
  readonly kind: "job"
  readonly id: string
}

export type CommandExecutionInvalidationListener = (
  reference: CommandExecutionJobReference
) => void

export interface CommandExecutionInvalidationSource {
  subscribeCommandExecutionInvalidations(
    listener: CommandExecutionInvalidationListener
  ): () => void
}

export interface CommandExecutionInvalidatedEvent {
  readonly kind: "product.command-execution.invalidated"
  readonly sequence: number
  readonly at: number
  readonly reference: CommandExecutionJobReference
}

export type CommandExecutionEventListener = (
  event: CommandExecutionInvalidatedEvent
) => void

export interface CommandExecutionEvents {
  subscribeCommandExecutionEvents(
    listener: CommandExecutionEventListener
  ): () => void
}
