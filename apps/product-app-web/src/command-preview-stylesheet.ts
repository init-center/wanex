export const PRODUCT_APP_WEB_COMMAND_PREVIEW_STYLESHEET = `
	[data-panel="command-preview"] dl {
	  display: grid;
	  grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
	  gap: var(--wanex-panel-dl-gap);
	  margin: 0;
	  padding: var(--wanex-panel-dl-padding);
	}

	[data-command-preview-empty-state] {
	  margin: 0;
	  padding: 12px 10px;
	  color: var(--wanex-muted);
	  font-size: 12px;
	  line-height: 1.35;
	  text-align: center;
	}

	[data-command-preview-state="runnable"] > h2 {
	  color: var(--wanex-accent-strong);
	}

	[data-command-preview-state="rejected"] > h2 {
	  color: var(--wanex-warning);
	}
`.trim()
