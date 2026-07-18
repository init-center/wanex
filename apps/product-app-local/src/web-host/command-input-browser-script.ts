export const PRODUCT_APP_WEB_COMMAND_INPUT_BROWSER_SCRIPT = `
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    if (target.matches('[data-command-invocation-form] [name="commandId"]')) {
      activateCommandInput(
        target.closest("[data-command-invocation-form]"),
        target.value
      );
      return;
    }
    if (target.hasAttribute("data-command-container-toggle")) {
      updateOptionalCommandContainer(target);
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.hasAttribute("data-command-array-add")) {
      addCommandArrayRow(target);
      return;
    }
    if (target.hasAttribute("data-command-array-remove")) {
      removeCommandArrayRow(target);
    }
  });

  function activateCommandInput(form, commandId) {
    if (!form) return;
    const fieldsets = form.querySelectorAll("[data-command-input-command]");
    for (const fieldset of fieldsets) {
      const active = fieldset.getAttribute("data-command-input-command") === commandId;
      fieldset.hidden = !active;
      fieldset.disabled = !active;
    }
  }

  function updateOptionalCommandContainer(toggle) {
    const container = toggle.closest("[data-command-input-node]");
    if (!container) return;
    const content = directChildWithAttribute(
      container,
      "data-command-container-content"
    );
    if (content instanceof HTMLFieldSetElement) {
      content.disabled = !toggle.checked;
    }
  }

  function addCommandArrayRow(button) {
    const array = button.closest("[data-command-input-array]");
    if (!array) return;
    const rows = directArrayRows(array);
    const template = directArrayTemplate(array);
    const maxItems = readBoundedCount(array.dataset.maxItems, 256);
    if (!rows || !template || rows.children.length >= maxItems) return;
    const row = template.content.firstElementChild?.cloneNode(true);
    if (!(row instanceof HTMLElement)) return;
    const index = rows.children.length;
    const path = array.dataset.commandInputPath || "";
    rewriteCommandInputPath(row, path + "/0", path + "/" + index);
    row.removeAttribute("data-command-array-template-row");
    row.setAttribute("data-array-index", String(index));
    enableClonedCommandRow(row);
    rows.append(row);
  }

  function removeCommandArrayRow(button) {
    const array = button.closest("[data-command-input-array]");
    const row = button.closest("[data-command-array-row]");
    const rows = array ? directArrayRows(array) : null;
    if (!array || !row || !rows) return;
    const minItems = readBoundedCount(array.dataset.minItems, 0);
    if (rows.children.length <= minItems) return;
    row.remove();
    renumberCommandArrayRows(array, rows);
  }

  function renumberCommandArrayRows(array, rows) {
    const path = array.dataset.commandInputPath || "";
    const children = Array.from(rows.children);
    for (let index = 0; index < children.length; index += 1) {
      const row = children[index];
      const oldIndex = row.getAttribute("data-array-index") || String(index);
      if (oldIndex !== String(index)) {
        rewriteCommandInputPath(
          row,
          path + "/" + oldIndex,
          path + "/" + index
        );
      }
      row.setAttribute("data-array-index", String(index));
    }
  }

  function rewriteCommandInputPath(root, from, to) {
    rewriteCommandInputNode(root, from, to);
  }

  function rewriteCommandInputNode(node, from, to) {
    if (node instanceof Element) {
      rewriteElementAttributes(node, from, to);
    }
    for (const child of node.children || []) {
      rewriteCommandInputNode(child, from, to);
    }
    if (node instanceof HTMLTemplateElement) {
      for (const child of node.content.children) {
        rewriteCommandInputNode(child, from, to);
      }
    }
  }

  function rewriteElementAttributes(element, from, to) {
    const attributes = [
      "name",
      "data-command-input-path",
      "data-command-input-field-path"
    ];
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value && value.includes(from)) {
        element.setAttribute(name, value.replace(from, to));
      }
    }
  }

  function enableClonedCommandRow(row) {
    const controls = row.querySelectorAll(
      "input, select, textarea, button, fieldset"
    );
    for (const control of controls) control.disabled = false;
    for (const toggle of row.querySelectorAll("[data-command-container-toggle]")) {
      toggle.checked = false;
      updateOptionalCommandContainer(toggle);
    }
  }

  function directArrayRows(array) {
    const content = directChildWithAttribute(
      array,
      "data-command-container-content"
    );
    return content
      ? directChildWithAttribute(content, "data-command-array-rows")
      : null;
  }

  function directArrayTemplate(array) {
    const content = directChildWithAttribute(
      array,
      "data-command-container-content"
    );
    if (!content) return null;
    for (const child of content.children) {
      if (
        child instanceof HTMLTemplateElement &&
        child.hasAttribute("data-command-array-template")
      ) {
        return child;
      }
    }
    return null;
  }

  function directChildWithAttribute(element, attribute) {
    for (const child of element.children) {
      if (child.hasAttribute(attribute)) return child;
    }
    return null;
  }

  function readBoundedCount(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 256
      ? parsed
      : fallback;
  }
`
