export const PRODUCT_APP_WEB_COMMAND_CATALOG_STYLESHEET = `
[data-command-catalog-message] {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--wanex-line);
  color: var(--wanex-muted);
  font-size: 12px;
}

[data-command-catalog-list],
[data-command-catalog-diagnostics] {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 8px;
  list-style: none;
}

[data-command-id] {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--wanex-line);
  border-radius: var(--wanex-radius);
  background: var(--wanex-panel-alt);
}

[data-command-id] strong,
[data-command-id] span,
[data-command-id] small,
[data-command-id] code {
  min-width: 0;
  overflow-wrap: anywhere;
}

[data-command-id] strong {
  font-size: 13px;
}

[data-command-id] span,
[data-command-id] small,
[data-command-id] code,
[data-command-catalog-empty-state],
[data-command-catalog-diagnostics] li {
  color: var(--wanex-muted);
  font-size: 11px;
}

[data-command-catalog-empty-state] {
  padding: 10px;
  text-align: center;
}
`.trim()
