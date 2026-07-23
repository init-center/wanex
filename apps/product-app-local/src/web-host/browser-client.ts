import { escapeHtml } from "@wanex/product-app-web"
import {
  PRODUCT_APP_WEB_COMMAND_INPUT_BROWSER_SCRIPT
} from "./command-input-browser-script.js"

export const DEFAULT_CLIENT_SCRIPT_PATH = "/wanex/product-app-web/client.js"
export const DEFAULT_STYLESHEET_PATH = "/wanex/product-app-web/styles.css"

export interface ProductAppWebNodeHostDocumentOptions {
  readonly surfaceHtml: string
  readonly requestPath: string
  readonly clientScriptPath: string
  readonly stylesheetPath: string
  readonly attachmentPath: string
  readonly pollIntervalMs: number
}

export function renderProductAppWebNodeHostDocument(
  options: ProductAppWebNodeHostDocumentOptions
): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Wanex Product App</title>",
    `<link rel="stylesheet" href="${escapeHtml(options.stylesheetPath)}" data-wanex-product-app-web-stylesheet>`,
    "</head>",
    "<body>",
    '<main data-wanex-product-app-web-shell>',
    options.surfaceHtml,
    "</main>",
    `<script src="${escapeHtml(options.clientScriptPath)}" data-wanex-product-app-web-client data-request-path="${escapeHtml(options.requestPath)}" data-attachment-path="${escapeHtml(options.attachmentPath)}" data-poll-interval-ms="${options.pollIntervalMs}"></script>`,
    "</body>",
    "</html>"
  ].join("")
}

export const PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT = `(() => {
  "use strict";

  const SURFACE_SELECTOR = '[data-wanex-product-app-web="surface"]';
  const SCRIPT_SELECTOR = "script[data-wanex-product-app-web-client]";
  const script =
    document.currentScript || document.querySelector(SCRIPT_SELECTOR);
  const requestPath =
    script && script.dataset && script.dataset.requestPath
      ? script.dataset.requestPath
      : "/wanex/product-app-web/request";
  const attachmentPath =
    script && script.dataset && script.dataset.attachmentPath
      ? script.dataset.attachmentPath
      : "/wanex/product-app-web/attachment";
  const pollIntervalMs = readPollIntervalMs(
    script && script.dataset ? script.dataset.pollIntervalMs : undefined
  );
  const POLL_LIMIT = 20;
  let requestSequence = 0;
  let surfaceVersion = 0;
  let actionInFlight = false;
  let pollInFlight = false;
  const attachmentObjectUrls = new Map();

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.action) {
      return;
    }
    event.preventDefault();
    void submitActionForm(form);
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-conversation-attachment-input]")) {
      return;
    }
    void uploadSelectedAttachments(input);
  });

  window.addEventListener("beforeunload", revokeAllAttachmentObjectUrls);

${PRODUCT_APP_WEB_COMMAND_INPUT_BROWSER_SCRIPT}

  decorateAttachmentPreviews(document.querySelector(SURFACE_SELECTOR));

  scheduleNextPoll();

  async function submitActionForm(form) {
    if (actionInFlight) {
      return;
    }
    const currentSurface = document.querySelector(SURFACE_SELECTOR);
    const composerText = readComposerText(currentSurface);
    const submitter = form.querySelector('button[type="submit"], button:not([type])');
    if (formSubmitBlocked(form, submitter)) {
      return;
    }
    const actionInput = actionInputFromForm(form);
    actionInFlight = true;
    setBusy(currentSurface, true);
    setDisabled(submitter, true);
    try {
      const payload = await postProductAppWebRequest({
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: nextRequestId(),
        input: actionInput
      });
      const nextSurface = replaceSurface(payload.document.html);
      if (payload.ok === false) {
        const message = readErrorMessage(payload.error, "Product App request failed");
        showError(nextSurface, message);
        return;
      }
      if (
        payload.operation === "submitActionInput" &&
        payload.submitResult &&
        payload.submitResult.ok === false
      ) {
        const parse = payload.submitResult.parse;
        const message = parse && parse.error
          ? readErrorMessage(parse.error, "Product App action failed")
          : "Product App action failed";
        showError(nextSurface, message);
        return;
      }
      clearFormTextInputs(form);
      if (actionInput.action !== "submit-conversation") {
        restoreComposerText(nextSurface, composerText);
      }
      restoreFocusAfterAction(nextSurface, actionInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(document.querySelector(SURFACE_SELECTOR) || currentSurface, message);
    } finally {
      actionInFlight = false;
      setBusy(document.querySelector(SURFACE_SELECTOR), false);
      setDisabled(submitter, false);
    }
  }

  async function uploadSelectedAttachments(input) {
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0 || actionInFlight) {
      return;
    }
    const currentSurface = document.querySelector(SURFACE_SELECTOR);
    const composerText = readComposerText(currentSurface);
    actionInFlight = true;
    setBusy(currentSurface, true);
    input.disabled = true;
    setAttachmentStatus(currentSurface, "Uploading " + files.length + " attachment(s)...");
    try {
      let nextSurface = currentSurface;
      for (const file of files) {
        const objectUrl = URL.createObjectURL(file);
        try {
          const payload = await postProductAttachment(file, input.dataset.sessionId);
          const attachment = payload && payload.upload ? payload.upload.attachment : undefined;
          if (!attachment || typeof attachment.resourceId !== "string") {
            throw new Error("Product App host returned an invalid attachment response");
          }
          const previousUrl = attachmentObjectUrls.get(attachment.resourceId);
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          attachmentObjectUrls.set(attachment.resourceId, objectUrl);
          nextSurface = replaceSurface(payload.document.html);
          restoreComposerText(nextSurface, composerText);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          throw error;
        }
      }
      setAttachmentStatus(nextSurface, files.length + " attachment(s) ready");
    } catch (error) {
      showError(
        document.querySelector(SURFACE_SELECTOR) || currentSurface,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      actionInFlight = false;
      const activeSurface = document.querySelector(SURFACE_SELECTOR);
      setBusy(activeSurface, false);
      const activeInput = activeSurface
        ? activeSurface.querySelector("[data-conversation-attachment-input]")
        : undefined;
      if (activeInput instanceof HTMLInputElement) {
        activeInput.disabled = false;
        activeInput.value = "";
      }
    }
  }

  async function postProductAttachment(file, sessionId) {
    const headers = {
      accept: "application/json",
      "content-type": "application/octet-stream",
      "x-wanex-media-type": encodeURIComponent(file.type || "application/octet-stream"),
      "x-wanex-attachment-label": encodeURIComponent(file.name)
    };
    if (sessionId) {
      headers["x-wanex-session-id"] = encodeURIComponent(sessionId);
    }
    const response = await fetch(attachmentPath, {
      method: "POST",
      headers,
      body: file
    });
    const payload = await response.json();
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(readErrorMessage(payload && payload.error, "Attachment upload failed"));
    }
    if (!payload.document || typeof payload.document.html !== "string") {
      throw new Error("Product App host returned an invalid attachment document");
    }
    return payload;
  }

  async function pollSurfaceEvents() {
    if (actionInFlight || pollInFlight || surfaceHasEditableFocus()) {
      scheduleNextPoll();
      return;
    }

    pollInFlight = true;
    const requestSurfaceVersion = surfaceVersion;
    setSurfacePollStatus(document.querySelector(SURFACE_SELECTOR), true);
    try {
      const payload = await postProductAppWebRequest({
        kind: "product-app-web.request",
        operation: "pollEvents",
        requestId: nextRequestId(),
        input: {
          limit: POLL_LIMIT
        }
      });
      if (requestSurfaceVersion !== surfaceVersion) {
        return;
      }
      const nextSurface = replaceSurface(payload.document.html);
      if (payload.ok === false) {
        showError(nextSurface, readErrorMessage(payload.error, "Product App poll failed"));
      }
    } catch (error) {
      showError(
        document.querySelector(SURFACE_SELECTOR),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      pollInFlight = false;
      setSurfacePollStatus(document.querySelector(SURFACE_SELECTOR), false);
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll() {
    if (pollIntervalMs <= 0) {
      return;
    }
    window.setTimeout(() => {
      void pollSurfaceEvents();
    }, pollIntervalMs);
  }

  function actionInputFromForm(form) {
    const fields = {};
    const data = new FormData(form);
    for (const entry of data.entries()) {
      const name = entry[0];
      const value = entry[1];
      if (name === "action") {
        continue;
      }
      fields[name] = value instanceof File ? value.name : String(value);
    }
    return {
      action: form.dataset.action || String(data.get("action") || ""),
      fields
    };
  }

  async function postProductAppWebRequest(request) {
    const response = await fetch(requestPath, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error("Product App host returned HTTP " + response.status);
    }
    if (
      !payload ||
      payload.kind !== "product-app-web.response" ||
      !payload.document ||
      typeof payload.document.html !== "string"
    ) {
      throw new Error("Product App host returned an invalid response envelope");
    }
    return payload;
  }

  function replaceSurface(html) {
    const currentSurface = document.querySelector(SURFACE_SELECTOR);
    const nextSurface = extractSurface(html);
    if (!currentSurface || !nextSurface) {
      throw new Error("Product App document did not contain a replaceable surface");
    }
    const scrollState = captureScrollState();
    currentSurface.replaceWith(nextSurface);
    surfaceVersion += 1;
    restoreScrollState(scrollState);
    decorateAttachmentPreviews(nextSurface);
    return nextSurface;
  }

  function decorateAttachmentPreviews(surface) {
    if (!surface) {
      return;
    }
    const activeResourceIds = new Set();
    const rows = surface.querySelectorAll("[data-conversation-attachment][data-resource-id]");
    for (const row of rows) {
      const resourceId = row.dataset.resourceId;
      if (!resourceId) {
        continue;
      }
      activeResourceIds.add(resourceId);
      const objectUrl = attachmentObjectUrls.get(resourceId);
      const target = row.querySelector("[data-conversation-attachment-preview]");
      if (!objectUrl || !target) {
        continue;
      }
      const previewKind = row.dataset.previewKind;
      const preview = createAttachmentPreview(previewKind, objectUrl);
      if (preview) {
        target.replaceChildren(preview);
      }
    }
    for (const entry of attachmentObjectUrls.entries()) {
      if (!activeResourceIds.has(entry[0])) {
        URL.revokeObjectURL(entry[1]);
        attachmentObjectUrls.delete(entry[0]);
      }
    }
  }

  function createAttachmentPreview(previewKind, objectUrl) {
    if (previewKind === "image") {
      const image = document.createElement("img");
      image.src = objectUrl;
      image.alt = "Attachment preview";
      return image;
    }
    if (previewKind === "audio") {
      const audio = document.createElement("audio");
      audio.src = objectUrl;
      audio.controls = true;
      return audio;
    }
    if (previewKind === "video") {
      const video = document.createElement("video");
      video.src = objectUrl;
      video.controls = true;
      video.muted = true;
      return video;
    }
    return undefined;
  }

  function revokeAllAttachmentObjectUrls() {
    for (const objectUrl of attachmentObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    attachmentObjectUrls.clear();
  }

  function readComposerText(surface) {
    const textarea = surface
      ? surface.querySelector('[data-action="submit-conversation"] textarea[name="text"]')
      : undefined;
    return textarea instanceof HTMLTextAreaElement ? textarea.value : "";
  }

  function restoreComposerText(surface, text) {
    const textarea = surface
      ? surface.querySelector('[data-action="submit-conversation"] textarea[name="text"]')
      : undefined;
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = text;
    }
  }

  function setAttachmentStatus(surface, message) {
    const status = surface
      ? surface.querySelector("[data-conversation-attachment-status]")
      : undefined;
    if (status) {
      status.textContent = message;
    }
  }

  function captureScrollState() {
    return {
      x: window.scrollX,
      y: window.scrollY
    };
  }

  function restoreScrollState(scrollState) {
    if (
      scrollState &&
      Number.isFinite(scrollState.x) &&
      Number.isFinite(scrollState.y)
    ) {
      window.scrollTo(scrollState.x, scrollState.y);
    }
  }

  function extractSurface(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content.querySelector(SURFACE_SELECTOR);
  }

  function setBusy(surface, busy) {
    if (!surface) {
      return;
    }
    if (busy) {
      surface.setAttribute("aria-busy", "true");
      surface.setAttribute("data-wanex-product-app-web-busy", "true");
      return;
    }
    surface.removeAttribute("aria-busy");
    surface.removeAttribute("data-wanex-product-app-web-busy");
  }

  function setDisabled(element, disabled) {
    if (!element) {
      return;
    }
    element.disabled = disabled;
  }

  function formSubmitBlocked(form, submitter) {
    return submitter && submitter.disabled === true;
  }

  function setSurfacePollStatus(surface, polling) {
    if (!surface) {
      return;
    }
    if (polling) {
      surface.setAttribute("data-wanex-product-app-web-polling", "true");
      return;
    }
    surface.removeAttribute("data-wanex-product-app-web-polling");
  }

  function clearFormTextInputs(form) {
    if (!form || form.getAttribute("data-action") !== "submit-conversation") {
      return;
    }
    const fields = form.querySelectorAll("textarea, input[type='text']");
    for (const field of fields) {
      field.value = "";
    }
  }

  function showError(surface, message) {
    if (!surface) {
      return;
    }
    surface.setAttribute("data-wanex-product-app-web-error", message);
    let alert = surface.querySelector("[data-wanex-product-app-web-alert]");
    if (!alert) {
      alert = document.createElement("p");
      alert.setAttribute("role", "alert");
      alert.setAttribute("data-wanex-product-app-web-alert", "");
      surface.prepend(alert);
    }
    alert.textContent = message;
    alert.setAttribute("tabindex", "-1");
    focusElement(alert);
  }

  function readErrorMessage(error, fallback) {
    return error && typeof error.message === "string" ? error.message : fallback;
  }

  function readPollIntervalMs(value) {
    if (value === undefined || value === "") {
      return 0;
    }
    const interval = Number(value);
    if (!Number.isSafeInteger(interval) || interval < 0) {
      return 0;
    }
    return interval;
  }

  function surfaceHasEditableFocus() {
    const active = document.activeElement;
    if (!active || !document.querySelector(SURFACE_SELECTOR)?.contains(active)) {
      return false;
    }
    return (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      active.isContentEditable === true
    );
  }

  function restoreFocusAfterAction(surface, actionInput) {
    const commandId = actionInput && actionInput.fields
      ? actionInput.fields.commandId
      : undefined;
    if (typeof commandId === "string") {
      const form = surface?.querySelector(
        '[data-action="' + actionInput.action + '"][data-command-invocation-form]'
      );
      const select = form?.querySelector('[name="commandId"]');
      if (select instanceof HTMLSelectElement) {
        select.value = commandId;
        activateCommandInput(form, commandId);
      }
    }
    const target = focusTargetAfterAction(surface, actionInput);
    focusElement(target);
  }

  function focusTargetAfterAction(surface, actionInput) {
    if (!surface || !actionInput || typeof actionInput.action !== "string") {
      return null;
    }
    switch (actionInput.action) {
      case "set-layout":
        return surface.querySelector('[data-action="set-layout"] [name="layout"]');
      case "set-mode":
        return surface.querySelector('[data-action="set-mode"] [name="mode"]');
      case "update-preferences":
        return preferenceFocusTarget(surface, actionInput.fields || {});
      case "set-active-provider-profile":
        return surface.querySelector('[data-action="set-active-provider-profile"] [name="profileId"]');
      case "submit-conversation":
      case "refresh-conversation":
      case "cancel-conversation":
      case "regenerate-conversation":
      case "open-workbench":
        return (
          surface.querySelector('[data-action="submit-conversation"] textarea') ||
          surface.querySelector('[data-panel="conversation"] button')
        );
      case "select-session":
        return selectedSessionButton(surface, actionInput.fields || {});
      case "refresh":
        return surface.querySelector('[data-action="refresh"] button');
      default:
        return null;
    }
  }

  function preferenceFocusTarget(surface, fields) {
    if (Object.prototype.hasOwnProperty.call(fields, "theme")) {
      return surface.querySelector('[data-action="update-preferences"] [name="theme"]');
    }
    if (Object.prototype.hasOwnProperty.call(fields, "density")) {
      return surface.querySelector('[data-action="update-preferences"] [name="density"]');
    }
    return surface.querySelector('[data-action="update-preferences"] select');
  }

  function selectedSessionButton(surface, fields) {
    const sessionId = fields.sessionId;
    if (typeof sessionId !== "string") {
      return null;
    }
    const rows = surface.querySelectorAll("[data-session-id]");
    for (const row of rows) {
      if (row.getAttribute("data-session-id") === sessionId) {
        return row.querySelector("button");
      }
    }
    return null;
  }

  function focusElement(element) {
    if (element && typeof element.focus === "function") {
      element.focus();
    }
  }

  function nextRequestId() {
    requestSequence += 1;
    return "product_app_web_browser_" + Date.now() + "_" + requestSequence;
  }
})();\n`
