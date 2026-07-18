export const PRODUCT_APP_WEB_COMMAND_EXECUTION_STYLESHEET = `
[data-panel="command-execution"] dl {
  display: grid;
  grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
  gap: var(--wanex-panel-dl-gap);
  margin: 0;
  padding: var(--wanex-panel-dl-padding);
}

[data-command-execution-message],
[data-command-execution-empty-state] {
  margin: 0;
  padding: 10px 14px;
  color: var(--wanex-muted);
}

[data-command-execution-state="completed"] {
  border-color: var(--wanex-accent);
}

[data-command-execution-state="rejected"] {
  border-color: var(--wanex-warning);
}

[data-command-execution-references] {
  margin: 0;
  padding: 8px 14px 12px 32px;
  color: var(--wanex-muted);
  font-size: 12px;
}
`.trim()
