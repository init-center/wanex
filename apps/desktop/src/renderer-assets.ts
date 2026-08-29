import type { WebBrowserAssets } from "@wanex/assistant-host/web-host";

// Desktop's build replaces this module with the bundled Renderer assets.
// Keeping a typed source module lets the main process remain ordinary TypeScript.
export const desktopRendererAssets: WebBrowserAssets = Object.freeze({
  clientScript: "",
  stylesheet: "",
});
