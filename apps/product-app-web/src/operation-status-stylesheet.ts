export const PRODUCT_APP_WEB_OPERATION_STATUS_STYLESHEET = `
[data-panel="operation-status"][data-operation-state="succeeded"] {
  border-color: var(--wanex-accent);
}

[data-panel="operation-status"][data-operation-state="blocked"] {
  border-color: var(--wanex-warning);
}

[data-panel="operation-status"][data-operation-state="failed"] {
  border-color: var(--wanex-danger);
}

[data-panel="operation-status"] [data-operation-message] {
  overflow-wrap: anywhere;
}
`
