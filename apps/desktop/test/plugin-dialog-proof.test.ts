// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runWanexDesktopPluginInstallProof,
  runWanexDesktopPluginRestoreProof,
} from "../src/plugin-management-proof.js";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const expected = {
  pluginId: "proof.extension",
  commandId: "proof.echo",
  v1Version: "1.0.0",
  v2Version: "2.0.0",
};

describe("installed Settings portal ownership", () => {
  it("cancels the owning shell's review, not a foreign review", async () => {
    vi.useFakeTimers();
    const { shell, settings, add } = fixture();
    const foreign = document.createElement("aside");
    foreign.innerHTML = `<section data-ui-extension-review>
      ${expected.pluginId} ${expected.v1Version}
      <button aria-label="Cancel extension review">Cancel</button>
    </section><p data-ui-extension-error>Foreign failure</p>`;
    document.body.prepend(foreign);
    const foreignCancel = vi.fn();
    foreign.querySelector("button")?.addEventListener("click", foreignCancel);
    const cancel = vi.fn();
    add.addEventListener("click", () => {
      const review = document.createElement("section");
      review.dataset.uiExtensionReview = "";
      review.innerHTML = `${expected.pluginId} ${expected.v1Version}
        <button aria-label="Cancel extension review">Cancel</button>`;
      review.querySelector("button")?.addEventListener("click", () => {
        cancel();
        review.remove();
        settings.insertAdjacentHTML("beforeend",
          '<p data-ui-extension-status>review cancelled</p>');
        // Stop this bounded driver test at the next independent review admission.
        add.disabled = true;
      });
      shell.append(review);
    });
    const result = runWanexDesktopPluginInstallProof(expected).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_050);
    expect(await result).toMatchObject({
      message: "Plugin proof add control is unavailable during v1_review",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(foreignCancel).not.toHaveBeenCalled();
    expect(shell.querySelector("[data-ui-extension-review]")).toBeNull();
    expect(foreign.querySelector("[data-ui-extension-review]")).not.toBeNull();
  });

  it("reports an owning portaled review error rather than timing out", async () => {
    vi.useFakeTimers();
    const { shell, add } = fixture();
    add.addEventListener("click", () => {
      shell.insertAdjacentHTML("beforeend",
        '<section data-ui-extension-review><p data-ui-extension-error>Review rejected</p></section>');
    });
    const result = runWanexDesktopPluginInstallProof(expected).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_050);
    expect(await result).toMatchObject({
      message: "Plugin proof cancel_review rejected: Review rejected",
    });
  });

  it("restores and removes both versions through portaled confirmations", async () => {
    vi.useFakeTimers();
    const { shell, settings } = fixture();
    const confirmed: string[] = [];
    for (const [version, state] of [["1.0.0", "disabled"], ["2.0.0", "installed"]]) {
      const row = document.createElement("article");
      row.dataset.uiExtension = `${expected.pluginId}@${version}`;
      row.dataset.uiExtensionState = state;
      row.innerHTML = '<button data-ui-extension-remove>Remove</button>';
      row.querySelector("button")?.addEventListener("click", () => {
        const dialog = document.createElement("section");
        dialog.dataset.uiExtensionRemoveDialog = "";
        dialog.innerHTML = '<button data-ui-extension-remove-confirm>Confirm</button>';
        dialog.querySelector("button")?.addEventListener("click", () => {
          confirmed.push(version!);
          row.dataset.uiExtensionState = "removed";
          row.replaceChildren();
          dialog.remove();
        });
        shell.append(dialog);
      });
      settings.append(row);
    }
    installCommandFixture(shell, () => confirmed.length === 0);
    const result = runWanexDesktopPluginRestoreProof(expected).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_050);
    expect(await result).toMatchObject({
      ok: true,
      reviewTransientAbsent: true,
      restoredCommandExecuted: true,
      v2Removed: true,
      v1Removed: true,
      commandAbsentAfterRemoval: true,
    });
    expect(confirmed).toEqual(["2.0.0", "1.0.0"]);
    expect(shell.querySelector("[data-ui-extension-remove-dialog]")).toBeNull();
  });

  it("does not report a restored portaled review as absent", async () => {
    vi.useFakeTimers();
    const { shell, settings } = fixture();
    shell.insertAdjacentHTML("beforeend", '<section data-ui-extension-review></section>');
    settings.insertAdjacentHTML("beforeend", `
      <article data-ui-extension="${expected.pluginId}@1.0.0" data-ui-extension-state="disabled"></article>
      <article data-ui-extension="${expected.pluginId}@2.0.0" data-ui-extension-state="installed"></article>`);
    installCommandFixture(shell, () => true);
    // Observe the actual driver's initial absence verdict through its result;
    // removals are still real click-driven DOM transitions in this fixture.
    for (const row of settings.querySelectorAll<HTMLElement>("[data-ui-extension]")) {
      row.innerHTML = '<button data-ui-extension-remove>Remove</button>';
      row.querySelector("button")?.addEventListener("click", () => {
        const dialog = document.createElement("section");
        dialog.dataset.uiExtensionRemoveDialog = "";
        dialog.innerHTML = '<button data-ui-extension-remove-confirm>Confirm</button>';
        dialog.querySelector("button")?.addEventListener("click", () => {
          row.dataset.uiExtensionState = "removed";
          row.replaceChildren();
          dialog.remove();
        });
        shell.append(dialog);
      });
    }
    const result = runWanexDesktopPluginRestoreProof(expected).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_050);
    expect(await result).toMatchObject({ ok: false, reviewTransientAbsent: false });
  });
});

function fixture() {
  document.body.innerHTML = `<main data-ui-assistant-shell>
    <button data-ui-action="open-settings">Settings</button>
    <button data-ui-action="open-add-menu">Add</button>
  </main>`;
  const shell = document.querySelector<HTMLElement>("main")!;
  const settings = document.createElement("section");
  settings.dataset.uiSettingsPanel = "";
  settings.innerHTML = `<div data-ui-extension-settings></div>
    <p data-ui-extension-empty></p><button data-ui-extension-add>Add extension</button>
    <button aria-label="Close settings">Close</button>`;
  shell.querySelector('[data-ui-action="open-settings"]')?.addEventListener("click", () => {
    shell.append(settings);
  });
  settings.querySelector('[aria-label="Close settings"]')?.addEventListener("click", () => settings.remove());
  return { shell, settings, add: settings.querySelector<HTMLButtonElement>("[data-ui-extension-add]")! };
}

function installCommandFixture(shell: HTMLElement, available: () => boolean) {
  shell.querySelector('[data-ui-action="open-add-menu"]')?.addEventListener("pointerdown", () => {
    const menu = document.createElement("div");
    menu.dataset.uiAddMenu = "";
    menu.innerHTML = '<button data-ui-action="open-commands">Commands</button>';
    menu.querySelector("button")?.addEventListener("click", () => {
      menu.remove();
      const palette = document.createElement("section");
      palette.dataset.uiCommandPalette = "";
      palette.innerHTML = '<button aria-label="Close commands">Close</button>';
      palette.querySelector("button")?.addEventListener("click", () => palette.remove());
      if (available()) {
        const command = document.createElement("button");
        command.dataset.uiCommand = expected.commandId;
        command.addEventListener("click", () => {
          palette.innerHTML = '<div data-ui-command-preview="runnable"><button>Execute</button></div>';
          palette.querySelector("button")?.addEventListener("click", () => {
            palette.innerHTML = '<div data-ui-command-execution="succeeded">Execution succeeded<button>Done</button></div>';
            palette.querySelector("button")?.addEventListener("click", () => palette.remove());
          });
        });
        palette.append(command);
      }
      shell.append(palette);
    });
    shell.append(menu);
  });
}
