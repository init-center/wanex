import { CLIENT_SCRIPT } from "@wanex/web/generated/client-script";
import { STYLESHEET } from "@wanex/web/generated/stylesheet";
import type { WebWindowChrome } from "./window-chrome.js";

export const CLIENT_SCRIPT_PATH = "/assets/app.js";
export const STYLESHEET_PATH = "/assets/app.css";

export interface DocumentOptions {
  readonly requestPath: string;
  readonly eventStreamPath: string;
  readonly attachmentPath?: string;
  readonly resourceDeliveryPreparePath?: string;
  readonly providerManagementPath?: string;
  readonly modelCatalogRefreshPath?: string;
  readonly capabilitySetupPath?: string;
  readonly hostSessionToken: string;
  readonly windowChrome: WebWindowChrome;
}

export function renderDocument(
  options: DocumentOptions,
): string {
  return [
    "<!doctype html>",
    `<html lang="en"${windowChromeAttribute(options.windowChrome)}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Wanex</title>",
    `<link rel="stylesheet" href="${STYLESHEET_PATH}">`,
    "</head>",
    "<body>",
    `<div data-app-root></div>`,
    `<script src="${CLIENT_SCRIPT_PATH}" data-app-client data-request-path="${escapeAttribute(options.requestPath)}" data-event-stream-path="${escapeAttribute(options.eventStreamPath)}"${optionalDataAttribute("attachment-path", options.attachmentPath)}${optionalDataAttribute("resource-delivery-prepare-path", options.resourceDeliveryPreparePath)}${optionalDataAttribute("provider-management-path", options.providerManagementPath)}${optionalDataAttribute("model-catalog-refresh-path", options.modelCatalogRefreshPath)}${optionalDataAttribute("capability-setup-path", options.capabilitySetupPath)} data-host-session-token="${escapeAttribute(options.hostSessionToken)}"></script>`,
    "</body>",
    "</html>",
  ].join("");
}

function windowChromeAttribute(windowChrome: WebWindowChrome): string {
  return windowChrome === "standard"
    ? ""
    : ` data-window-chrome="${escapeAttribute(windowChrome)}"`;
}

function optionalDataAttribute(name: string, value: string | undefined): string {
  return value === undefined
    ? ""
    : ` data-${name}="${escapeAttribute(value)}"`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export { CLIENT_SCRIPT, STYLESHEET };
