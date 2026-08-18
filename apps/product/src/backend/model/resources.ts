import type { WanexApp } from "@wanex/app"

export type BackendResourceCommands = Pick<
  WanexApp["commands"],
  "ingestResource" | "readResource" | "readResourceContent"
>
