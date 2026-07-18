export const PRODUCT_APP_WEB_PROVIDER_RUN_GATE_STYLESHEET = `
[data-panel="provider-run-gate"][data-provider-run-gate-state="blocked"] {
  border-color: var(--wanex-warning);
}

[data-provider-run-gate-message] {
  margin: 0;
  padding: 12px 14px 0;
  color: var(--wanex-muted);
  font-size: 13px;
  line-height: 1.35;
}

[data-panel="provider-run-gate"][data-provider-run-gate-state="blocked"] [data-provider-run-gate-message] {
  color: var(--wanex-warning);
}
`
