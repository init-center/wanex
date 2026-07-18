import type { ChannelStore } from "@wanex/storage/channel"
import type { ConnectorStore } from "@wanex/storage/connector"

export type ConnectorRuntimeStorage =
  & ConnectorStore
  & ChannelStore
