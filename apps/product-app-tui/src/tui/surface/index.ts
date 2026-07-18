export const WANEX_PRODUCT_APP_TUI_CONTRIBUTIONS = "wanex-product-app-tui-contributions" as const

export {
  DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER,
  TUI_CONTRIBUTION_DOMAINS,
  isTuiContributionDomain,
  resolveTuiContributions
} from "./resolver.js"
export type * from "./types.js"
