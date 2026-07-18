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
    `<script src="${escapeHtml(options.clientScriptPath)}" data-wanex-product-app-web-client data-request-path="${escapeHtml(options.requestPath)}" data-poll-interval-ms="${options.pollIntervalMs}"></script>`,
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
  const pollIntervalMs = readPollIntervalMs(
    script && script.dataset ? script.dataset.pollIntervalMs : undefined
  );
  const POLL_LIMIT = 20;
  let requestSequence = 0;
  let surfaceVersion = 0;
  let actionInFlight = false;
  let pollInFlight = false;

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.action) {
      return;
    }
    event.preventDefault();
    void submitActionForm(form);
  });

${PRODUCT_APP_WEB_COMMAND_INPUT_BROWSER_SCRIPT}

  scheduleNextPoll();

  async function submitActionForm(form) {
    if (actionInFlight) {
      return;
    }
    const currentSurface = document.querySelector(SURFACE_SELECTOR);
    const submitter = form.querySelector('button[type="submit"], button:not([type])');
    if (formSubmitBlocked(form, submitter)) {
      return;
    }
    const actionInput = actionInputFromForm(form);
    actionInFlight = true;
    setBusy(currentSurface, true);
    setDisabled(submitter, true);
    setComposerStatus(form, "submitting", "Sending...");
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
        setComposerStatus(nextSurface.querySelector("[data-workbench-composer]"), "error", message);
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
        setComposerStatus(nextSurface.querySelector("[data-workbench-composer]"), "error", message);
        return;
      }
      clearFormTextInputs(form);
      restoreFocusAfterAction(nextSurface, actionInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(document.querySelector(SURFACE_SELECTOR) || currentSurface, message);
      setComposerStatus(form, "error", message);
    } finally {
      actionInFlight = false;
      setBusy(document.querySelector(SURFACE_SELECTOR), false);
      setDisabled(submitter, false);
    }
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
    return nextSurface;
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
    return (
      form.getAttribute("data-workbench-composer-state") === "blocked" ||
      (submitter && submitter.disabled === true)
    );
  }

  function setComposerStatus(form, state, message) {
    if (!form || !form.hasAttribute("data-workbench-composer")) {
      return;
    }
    form.setAttribute("data-workbench-composer-state", state);
    const status = form.querySelector("[data-workbench-composer-status]");
    if (status) {
      status.textContent = message;
    }
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
    if (!form || !form.hasAttribute("data-workbench-composer")) {
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
      case "start-workbench":
      case "continue-workbench":
      case "open-workbench":
        return (
          surface.querySelector("[data-workbench-composer] textarea") ||
          surface.querySelector("[data-workbench-composer] button")
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
