import "@wanex/assistant-ui/styles.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import {
  createHttpClient,
  type Client as AssistantClient,
} from "@wanex/assistant-ui/client";
import type { DesktopCodingRendererBridge } from "../coding-bridge.js";
import { createDesktopRendererCodingClient } from "./coding/client.js";
import { ProductRenderer } from "./product.js";

const root = document.querySelector<HTMLElement>("[data-app-root]");
const script = document.querySelector<HTMLScriptElement>(
  "script[data-app-client]",
);
if (root === null || script === null) {
  throw new Error("Desktop renderer bootstrap elements are missing");
}

const assistantClient: AssistantClient = createHttpClient({
  requestPath: requiredDataset(script, "requestPath"),
  hostSessionToken: requiredDataset(script, "hostSessionToken"),
  ...(script.dataset.eventStreamPath === undefined
    ? {}
    : { eventStreamPath: script.dataset.eventStreamPath }),
  ...(script.dataset.attachmentPath === undefined
    ? {}
    : { attachmentPath: script.dataset.attachmentPath }),
  ...(script.dataset.resourceDeliveryPreparePath === undefined
    ? {}
    : { resourceDeliveryPreparePath: script.dataset.resourceDeliveryPreparePath }),
  ...(script.dataset.providerManagementPath === undefined
    ? {}
    : { providerManagementPath: script.dataset.providerManagementPath }),
  ...(script.dataset.modelCatalogRefreshPath === undefined
    ? {}
    : { modelCatalogRefreshPath: script.dataset.modelCatalogRefreshPath }),
  ...(script.dataset.capabilitySetupPath === undefined
    ? {}
    : { capabilitySetupPath: script.dataset.capabilitySetupPath }),
});
const codingBridge = readCodingBridge();
const codingClient = codingBridge === undefined
  ? undefined
  : createDesktopRendererCodingClient(codingBridge);

createRoot(root).render(
  <ProductRenderer
    assistantClient={assistantClient}
    codingClient={codingClient}
  />,
);

function readCodingBridge(): DesktopCodingRendererBridge | undefined {
  const value = (globalThis as typeof globalThis & {
    wanexCoding?: DesktopCodingRendererBridge;
  }).wanexCoding;
  return value;
}

function requiredDataset(element: HTMLScriptElement, key: string): string {
  const value = element.dataset[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Desktop renderer dataset ${key} is missing`);
  }
  return value;
}
