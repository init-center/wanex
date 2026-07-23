import type { WanexApp } from "@wanex/app"

export type ProductAppBackendResourceCommands = Pick<
  WanexApp["commands"],
  "ingestResource" | "readResource"
>
