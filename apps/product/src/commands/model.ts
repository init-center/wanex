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
