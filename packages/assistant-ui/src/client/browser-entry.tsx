import "../assets/styles.css";
import { createHttpClient } from "./http-client.js";
import { mountClient } from "./mount.js";

const script = document.currentScript instanceof HTMLScriptElement
  ? document.currentScript
  : document.querySelector<HTMLScriptElement>(
      "script[data-app-client]",
    );
const root = document.querySelector<HTMLElement>(
  "[data-app-root]",
);
if (script === null || root === null) {
  throw new Error("Web client bootstrap elements are missing");
}

const requestPath = requiredDataset(script, "requestPath");
const hostSessionToken = requiredDataset(script, "hostSessionToken");
const eventStreamPath = script.dataset.eventStreamPath;
const attachmentPath = script.dataset.attachmentPath;
const resourceDeliveryPreparePath = script.dataset.resourceDeliveryPreparePath;
const providerManagementPath = script.dataset.providerManagementPath;
const modelCatalogRefreshPath = script.dataset.modelCatalogRefreshPath;
const capabilitySetupPath = script.dataset.capabilitySetupPath;
const mcpSettingsPath = script.dataset.mcpSettingsPath;
const client = createHttpClient({
  requestPath,
  hostSessionToken,
  ...(eventStreamPath === undefined ? {} : { eventStreamPath }),
  ...(attachmentPath === undefined ? {} : { attachmentPath }),
  ...(resourceDeliveryPreparePath === undefined
    ? {}
    : { resourceDeliveryPreparePath }),
  ...(providerManagementPath === undefined ? {} : { providerManagementPath }),
  ...(modelCatalogRefreshPath === undefined ? {} : { modelCatalogRefreshPath }),
  ...(capabilitySetupPath === undefined ? {} : { capabilitySetupPath }),
  ...(mcpSettingsPath === undefined ? {} : { mcpSettingsPath }),
});
mountClient({ root, client });

function requiredDataset(element: HTMLScriptElement, key: string): string {
  const value = element.dataset[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Web client dataset ${key} is missing`);
  }
  return value;
}
