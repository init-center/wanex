export const PRODUCT_APP_WEB_PROVIDER_PROFILE_STYLESHEET = `
[data-provider-profile-list] {
  list-style: none;
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--wanex-line);
}

[data-provider-profile-list] li {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--wanex-line);
  border-radius: 8px;
  background: var(--wanex-panel-alt);
  overflow-wrap: anywhere;
}

[data-provider-profile-list] li[data-provider-profile-active="true"] {
  border-color: var(--wanex-accent);
}

[data-provider-profile-list] div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

[data-provider-profile-list] strong {
  font-size: 13px;
  line-height: 1.3;
}

[data-provider-profile-list] span,
[data-provider-profile-list] small {
  color: var(--wanex-muted);
  font-size: 12px;
  line-height: 1.3;
}

[data-provider-profile-list] li[data-provider-profile-active="true"] div span {
  color: var(--wanex-accent-strong);
}
`.trim()
