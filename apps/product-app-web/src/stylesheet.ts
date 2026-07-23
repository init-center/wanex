import { PRODUCT_APP_WEB_PROVIDER_PROFILE_STYLESHEET } from "./provider-profile-stylesheet.js"
import { PRODUCT_APP_WEB_PROVIDER_RUN_GATE_STYLESHEET } from "./provider-run-gate-stylesheet.js"
import { PRODUCT_APP_WEB_OPERATION_STATUS_STYLESHEET } from "./operation-status-stylesheet.js"
import { PRODUCT_APP_WEB_COMMAND_PREVIEW_STYLESHEET } from "./command-preview-stylesheet.js"
import { PRODUCT_APP_WEB_COMMAND_CATALOG_STYLESHEET } from "./command-catalog-stylesheet.js"
import { PRODUCT_APP_WEB_COMMAND_EXECUTION_STYLESHEET } from "./command-execution-stylesheet.js"

export const PRODUCT_APP_WEB_STYLESHEET = `
:root {
  color-scheme: light dark;
  --wanex-bg: #f6f7f9;
  --wanex-panel: #ffffff;
  --wanex-panel-alt: #eef3f6;
  --wanex-text: #172026;
  --wanex-muted: #5c6870;
  --wanex-line: #d7dee3;
  --wanex-accent: #1f7a68;
  --wanex-accent-strong: #15594d;
  --wanex-danger: #b42318;
  --wanex-warning: #9a6700;
  --wanex-radius: 8px;
  --wanex-shadow: 0 1px 2px rgb(23 32 38 / 8%);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --wanex-bg: #101416;
    --wanex-panel: #171d20;
    --wanex-panel-alt: #20282c;
    --wanex-text: #eef2f4;
    --wanex-muted: #aab4ba;
    --wanex-line: #313b40;
    --wanex-accent: #42b59f;
    --wanex-accent-strong: #77d1c0;
    --wanex-danger: #ff8a80;
    --wanex-warning: #ffd166;
    --wanex-shadow: none;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--wanex-bg);
  color: var(--wanex-text);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 1px solid var(--wanex-line);
  border-radius: 8px;
  background: var(--wanex-panel);
  color: var(--wanex-text);
  cursor: pointer;
}

button:hover {
  border-color: var(--wanex-accent);
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--wanex-line);
  border-radius: 8px;
  background: var(--wanex-panel);
  color: var(--wanex-text);
}

textarea {
  min-height: var(--wanex-textarea-min-height, 108px);
  resize: vertical;
}

[data-wanex-product-app-web-shell] {
  min-height: 100vh;
}

[data-wanex-product-app-web="surface"] {
  --wanex-header-gap: 16px;
  --wanex-header-padding: 16px 20px;
  --wanex-workspace-gap: 16px;
  --wanex-workspace-padding: 16px;
  --wanex-panel-heading-padding: 12px 14px;
  --wanex-panel-dl-gap: 8px 12px;
  --wanex-panel-dl-padding: 14px;
  --wanex-control-list-gap: 10px;
  --wanex-control-list-padding: 12px;
  --wanex-form-gap: 8px;
  --wanex-textarea-min-height: 108px;
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--wanex-bg);
  color: var(--wanex-text);
}

[data-wanex-product-app-web="surface"][data-product-theme="light"] {
  color-scheme: light;
  --wanex-bg: #f6f7f9;
  --wanex-panel: #ffffff;
  --wanex-panel-alt: #eef3f6;
  --wanex-text: #172026;
  --wanex-muted: #5c6870;
  --wanex-line: #d7dee3;
  --wanex-accent: #1f7a68;
  --wanex-accent-strong: #15594d;
  --wanex-danger: #b42318;
  --wanex-warning: #9a6700;
  --wanex-shadow: 0 1px 2px rgb(23 32 38 / 8%);
}

[data-wanex-product-app-web="surface"][data-product-theme="dark"] {
  color-scheme: dark;
  --wanex-bg: #101416;
  --wanex-panel: #171d20;
  --wanex-panel-alt: #20282c;
  --wanex-text: #eef2f4;
  --wanex-muted: #aab4ba;
  --wanex-line: #313b40;
  --wanex-accent: #42b59f;
  --wanex-accent-strong: #77d1c0;
  --wanex-danger: #ff8a80;
  --wanex-warning: #ffd166;
  --wanex-shadow: none;
}

[data-wanex-product-app-web="surface"][data-product-density="compact"] {
  --wanex-header-gap: 10px;
  --wanex-header-padding: 10px 14px;
  --wanex-workspace-gap: 10px;
  --wanex-workspace-padding: 10px;
  --wanex-panel-heading-padding: 9px 11px;
  --wanex-panel-dl-gap: 6px 10px;
  --wanex-panel-dl-padding: 10px;
  --wanex-control-list-gap: 7px;
  --wanex-control-list-padding: 9px;
  --wanex-form-gap: 7px;
  --wanex-textarea-min-height: 84px;
  --wanex-radius: 6px;
}

[data-wanex-product-app-web-busy="true"] {
  cursor: progress;
}

[data-product-shell-header] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wanex-header-gap);
  padding: var(--wanex-header-padding);
  border-bottom: 1px solid var(--wanex-line);
  background: var(--wanex-panel);
  box-shadow: var(--wanex-shadow);
}

[data-product-title] {
  display: grid;
  gap: 4px;
}

[data-product-title] h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 650;
  letter-spacing: 0;
}

[data-product-title] p {
  margin: 0;
  color: var(--wanex-muted);
  font-size: 13px;
  line-height: 1.35;
}

[data-product-status] {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

[data-product-status] span,
[data-session-id] small,
[data-workbench-row] header span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid var(--wanex-line);
  border-radius: 999px;
  color: var(--wanex-muted);
  font-size: 12px;
  line-height: 1.2;
}

[data-mode-navigation] {
  min-height: 48px;
  display: flex;
  align-items: end;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--wanex-line);
  background: var(--wanex-panel);
  overflow-x: auto;
}

[data-mode-navigation-form] {
  margin: 0;
}

[data-mode-tab] {
  min-width: 96px;
  min-height: 44px;
  padding: 8px 14px;
  border: 0;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--wanex-muted);
}

[data-mode-tab]:hover {
  border-bottom-color: var(--wanex-line);
}

[data-mode-tab][aria-current="page"] {
  border-bottom-color: var(--wanex-accent);
  color: var(--wanex-text);
  font-weight: 650;
}

[data-region="workspace"] {
  width: min(1480px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(240px, 320px);
  gap: var(--wanex-workspace-gap);
  padding: var(--wanex-workspace-padding);
}

[data-product-layout="single"] [data-region="workspace"] {
  width: min(980px, 100%);
  grid-template-columns: minmax(0, 1fr);
}

[data-product-layout="single"] [data-region="main"] {
  order: 1;
}

[data-product-layout="single"] [data-region="left"] {
  order: 2;
}

[data-product-layout="single"] [data-region="right"] {
  order: 3;
}

[data-product-layout="split"] [data-region="workspace"] {
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(240px, 320px);
}

[data-product-layout="diagnostics"] [data-region="workspace"] {
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(300px, 420px);
}

[data-product-layout="diagnostics"] [data-region="right"] {
  gap: 12px;
}

[data-product-mode="chat"] [data-region="workspace"],
[data-product-mode="workbench"] [data-region="workspace"] {
  width: min(1180px, 100%);
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
}

[data-product-mode="chat"] [data-region="left"],
[data-product-mode="workbench"] [data-region="left"] {
  order: 1;
}

[data-product-mode="chat"] [data-region="main"],
[data-product-mode="workbench"] [data-region="main"] {
  order: 2;
}

[data-product-mode="diagnostics"] [data-region="workspace"] {
  width: min(1480px, 100%);
  grid-template-columns: minmax(240px, 300px) minmax(240px, 1fr) minmax(300px, 420px);
}

[data-region="left"],
[data-region="main"],
[data-region="right"] {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
}

[data-panel] {
  border: 1px solid var(--wanex-line);
  border-radius: var(--wanex-radius);
  background: var(--wanex-panel);
  box-shadow: var(--wanex-shadow);
  overflow: hidden;
}

[data-panel] > h2 {
  margin: 0;
  padding: var(--wanex-panel-heading-padding);
  border-bottom: 1px solid var(--wanex-line);
  font-size: 13px;
  line-height: 1.25;
  font-weight: 650;
  letter-spacing: 0;
}

[data-panel="summary"] dl,
[data-panel="settings"] dl,
[data-panel="provider-run-gate"] dl,
[data-panel="workbench"] dl {
  display: grid;
  grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
  gap: var(--wanex-panel-dl-gap);
  margin: 0;
  padding: var(--wanex-panel-dl-padding);
}

dt {
  color: var(--wanex-muted);
  font-size: 12px;
}

dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

[data-session-list],
[data-workbench-transcript],
[data-panel="events"] ol,
[data-panel="diagnostics"] ul {
  list-style: none;
  margin: 0;
  padding: 8px;
}

[data-session-list] {
  display: grid;
  gap: 6px;
}

[data-session-id] form {
  margin: 0;
}

[data-session-id] button {
  width: 100%;
  display: grid;
  gap: 6px;
  padding: 10px;
  text-align: left;
}

[data-session-id][aria-current="true"] button {
  border-color: var(--wanex-accent);
  background: var(--wanex-panel-alt);
}

[data-session-id] span,
[data-workbench-row] p {
  min-width: 0;
  overflow-wrap: anywhere;
}

[data-session-empty-state],
[data-events-empty-state],
[data-diagnostics-empty-state] {
  padding: 12px 10px;
  color: var(--wanex-muted);
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
}

[data-action-list] {
  display: grid;
  gap: var(--wanex-control-list-gap);
  padding: var(--wanex-control-list-padding);
}

[data-settings-controls] {
  display: grid;
  gap: var(--wanex-control-list-gap);
  padding: var(--wanex-control-list-padding);
  border-bottom: 1px solid var(--wanex-line);
}

	${PRODUCT_APP_WEB_PROVIDER_RUN_GATE_STYLESHEET}

	${PRODUCT_APP_WEB_OPERATION_STATUS_STYLESHEET}

	${PRODUCT_APP_WEB_COMMAND_PREVIEW_STYLESHEET}

	${PRODUCT_APP_WEB_COMMAND_CATALOG_STYLESHEET}

	${PRODUCT_APP_WEB_COMMAND_EXECUTION_STYLESHEET}

	${PRODUCT_APP_WEB_PROVIDER_PROFILE_STYLESHEET}

[data-action-list] form,
[data-settings-controls] form,
[data-panel="conversation"] form {
  display: grid;
  gap: var(--wanex-form-gap);
  margin: 0;
}

[data-action-list] label,
[data-settings-controls] label,
[data-panel="conversation"] label {
  display: grid;
  gap: 6px;
  color: var(--wanex-muted);
  font-size: 12px;
}

[data-action-list] button,
[data-settings-controls] button,
[data-panel="conversation"] button {
  min-height: 36px;
  padding: 7px 10px;
}

[data-action="refresh"] button,
[data-action="open-workbench"] button,
[data-action="submit-conversation"] button {
  border-color: var(--wanex-accent);
  background: var(--wanex-accent);
  color: #ffffff;
}

[data-action="refresh"] button:hover,
[data-action="open-workbench"] button:hover,
[data-action="submit-conversation"] button:hover {
  border-color: var(--wanex-accent-strong);
  background: var(--wanex-accent-strong);
}

[data-panel="workbench"] {
  min-height: 420px;
}

[data-panel="conversation"] {
  display: grid;
  gap: 0;
}

[data-product-mode="workbench"] [data-panel="workbench"] {
  border-color: var(--wanex-accent);
}

[data-product-mode="workbench"] [data-panel="workbench"] > h2 {
  color: var(--wanex-accent-strong);
}

[data-product-mode="diagnostics"] [data-panel="events"],
[data-product-mode="diagnostics"] [data-panel="diagnostics"] {
  border-color: var(--wanex-warning);
}

[data-product-mode="diagnostics"] [data-panel="events"] > h2,
[data-product-mode="diagnostics"] [data-panel="diagnostics"] > h2 {
  color: var(--wanex-warning);
}

[data-workbench-session],
[data-workbench-message],
[data-workbench-empty-state],
[data-workbench-latest-user],
[data-workbench-latest-assistant],
[data-conversation-operation],
[data-conversation-message],
[data-conversation-empty-state] {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--wanex-line);
  color: var(--wanex-muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}

[data-workbench-empty-state] {
  border-top: 1px solid var(--wanex-line);
  text-align: center;
}

[data-workbench-transcript],
[data-conversation-transcript] {
  display: grid;
  gap: 10px;
  max-height: 52vh;
  overflow: auto;
}

[data-workbench-row] article,
[data-conversation-row] article,
[data-conversation-transient-assistant] {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--wanex-line);
  border-radius: 8px;
  background: var(--wanex-panel-alt);
}

[data-workbench-row] header,
[data-conversation-row] header,
[data-conversation-transient-assistant] header {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

[data-workbench-row] p,
[data-conversation-row] p,
[data-conversation-transient-assistant] p {
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.45;
}

[data-action="submit-conversation"] {
  padding: var(--wanex-control-list-padding);
  border-top: 1px solid var(--wanex-line);
}

[data-conversation-attachment-picker] {
  padding: 10px var(--wanex-control-list-padding);
  border-top: 1px solid var(--wanex-line);
}

[data-conversation-attachment-status],
[data-conversation-attachment-error] {
  min-height: 18px;
  margin: 0;
  padding: 0 var(--wanex-control-list-padding) 8px;
  color: var(--wanex-muted);
  font-size: 12px;
}

[data-conversation-attachment-error] {
  color: var(--wanex-danger);
}

[data-conversation-attachments] {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0 var(--wanex-control-list-padding) 10px;
  list-style: none;
}

[data-conversation-attachments][data-empty="true"] {
  display: none;
}

[data-conversation-attachment] {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--wanex-line);
  border-radius: 8px;
  background: var(--wanex-panel-alt);
}

[data-conversation-attachment-preview] {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--wanex-panel);
}

[data-conversation-attachment-preview] img,
[data-conversation-attachment-preview] video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

[data-conversation-attachment-preview] audio {
  width: 44px;
  height: 32px;
}

[data-conversation-attachment-metadata] {
  display: grid;
  min-width: 0;
  gap: 3px;
}

[data-conversation-attachment-metadata] strong,
[data-conversation-attachment-metadata] small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-conversation-attachment] [data-action="remove-conversation-attachment"] button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  color: var(--wanex-danger);
}

[data-conversation-controls] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--wanex-form-gap);
  padding: var(--wanex-control-list-padding);
  border-top: 1px solid var(--wanex-line);
}

[data-panel="conversation"] button:disabled {
  cursor: not-allowed;
}

[data-panel="events"] li,
[data-panel="diagnostics"] li {
  padding: 8px 4px;
  border-bottom: 1px solid var(--wanex-line);
  color: var(--wanex-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

[data-panel="events"] li:last-child,
[data-panel="diagnostics"] li:last-child {
  border-bottom: 0;
}

[data-severity="error"],
[data-wanex-product-app-web-alert] {
  color: var(--wanex-danger);
}

[data-severity="warning"] {
  color: var(--wanex-warning);
}

[data-wanex-product-app-web-alert] {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid currentColor;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 13px;
}

@media (max-width: 1080px) {
  [data-region="workspace"] {
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  }

  [data-product-layout="single"] [data-region="workspace"],
  [data-product-layout="diagnostics"] [data-region="workspace"] {
    grid-template-columns: minmax(0, 1fr);
  }

  [data-product-mode="chat"] [data-region="workspace"],
  [data-product-mode="workbench"] [data-region="workspace"] {
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  }

  [data-region="right"] {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  [data-product-shell-header] {
    align-items: flex-start;
    flex-direction: column;
  }

  [data-product-status] {
    justify-content: flex-start;
  }

  [data-mode-navigation] {
    padding: 0 12px;
  }

  [data-mode-tab] {
    min-width: 88px;
  }

  [data-region="workspace"],
  [data-product-mode="chat"] [data-region="workspace"],
  [data-product-mode="workbench"] [data-region="workspace"],
  [data-region="right"] {
    grid-template-columns: minmax(0, 1fr);
  }

  [data-workbench-transcript] {
    max-height: none;
  }
}
`.trim()

export function renderProductAppWebStylesheet(): string {
  return PRODUCT_APP_WEB_STYLESHEET
}
