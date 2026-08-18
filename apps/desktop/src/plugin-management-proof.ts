import type {
  WanexDesktopPluginInstallProofResult,
  WanexDesktopPluginProofExpected,
  WanexDesktopPluginRestoreProofResult,
} from "./proof-contract.js";

export function wanexDesktopPluginInstallProofScript(
  expected: WanexDesktopPluginProofExpected,
): string {
  return `(${runWanexDesktopPluginInstallProof.toString()})(${JSON.stringify(expected)})`;
}

export function wanexDesktopPluginRestoreProofScript(
  expected: WanexDesktopPluginProofExpected,
): string {
  return `(${runWanexDesktopPluginRestoreProof.toString()})(${JSON.stringify(expected)})`;
}

export async function runWanexDesktopPluginInstallProof(
  expected: WanexDesktopPluginProofExpected,
): Promise<WanexDesktopPluginInstallProofResult> {
  const startedAt = performance.now();
  const ready = await productReady("install_product_ready");
  const rendererInteractive = performance.now() - startedAt;
  const settings = await openSettings(ready.surface, ready.settings);
  const initialEmptyStateVisible =
    settings.querySelector("[data-ui-extension-empty]") !== null &&
    extensionRows(settings).length === 0;

  const cancelledReview = await requestReview(
    settings,
    expected,
    expected.v1Version,
    "cancel_review",
  );
  const cancelReviewEvidenceVisible = reviewEvidenceVisible(
    cancelledReview.review,
    expected,
    expected.v1Version,
  );
  const cancel = cancelledReview.review.querySelector(
    'button[aria-label="Cancel extension review"]',
  );
  if (!(cancel instanceof HTMLButtonElement)) {
    throw new Error("Plugin proof cancel review control is unavailable");
  }
  cancel.click();
  await waitForDom(
    () => settings.querySelector("[data-ui-extension-review]") === null
      ? true
      : undefined,
    10_000,
    "cancel_review_settlement",
  );
  const reviewCancelled = settings.querySelector("[data-ui-extension-status]")
    ?.textContent?.includes("review cancelled") === true;
  const cancelledReviewNotInstalled = extensionRows(settings).length === 0;

  const v1Review = await requestReview(
    settings,
    expected,
    expected.v1Version,
    "v1_review",
  );
  approveReview(v1Review.review);
  const v1Row = await waitForExtensionState(
    settings,
    expected.pluginId,
    expected.v1Version,
    "installed",
    "v1_install",
  );
  const v1Installed = v1Row.getAttribute("data-ui-extension-state") === "installed";
  closeSettings(settings);

  const firstExecutionStartedAt = performance.now();
  const v1CommandAvailable = await executeCommand(
    ready.surface,
    expected.commandId,
    "v1_command",
  );
  const v1CommandExecuted = v1CommandAvailable;

  const disableSettings = await openSettings(ready.surface, ready.settings);
  const disableRow = requiredExtensionRow(
    disableSettings,
    expected.pluginId,
    expected.v1Version,
  );
  const disableToggle = requiredToggle(disableRow);
  if (!disableToggle.checked) {
    throw new Error("Plugin proof v1 toggle is not enabled before disable");
  }
  disableToggle.click();
  await waitForExtensionState(
    disableSettings,
    expected.pluginId,
    expected.v1Version,
    "disabled",
    "v1_disable",
  );
  const v1Disabled = !requiredToggle(requiredExtensionRow(
    disableSettings,
    expected.pluginId,
    expected.v1Version,
  )).checked;
  closeSettings(disableSettings);
  const commandAbsentWhileDisabled = await commandAbsent(
    ready.surface,
    expected.commandId,
    "disabled_command_absent",
  );

  const enableSettings = await openSettings(ready.surface, ready.settings);
  const enableToggle = requiredToggle(requiredExtensionRow(
    enableSettings,
    expected.pluginId,
    expected.v1Version,
  ));
  if (enableToggle.checked) {
    throw new Error("Plugin proof v1 toggle is enabled before re-enable");
  }
  enableToggle.click();
  await waitForExtensionState(
    enableSettings,
    expected.pluginId,
    expected.v1Version,
    "installed",
    "v1_enable",
  );
  const v1Enabled = requiredToggle(requiredExtensionRow(
    enableSettings,
    expected.pluginId,
    expected.v1Version,
  )).checked;
  closeSettings(enableSettings);
  const commandReturnedAfterEnable = await executeCommand(
    ready.surface,
    expected.commandId,
    "enabled_command",
  );

  const replaceSettings = await openSettings(ready.surface, ready.settings);
  const v2Review = await requestReview(
    replaceSettings,
    expected,
    expected.v2Version,
    "v2_review",
  );
  const v2ReviewEvidenceVisible = reviewEvidenceVisible(
    v2Review.review,
    expected,
    expected.v2Version,
  );
  approveReview(v2Review.review);
  const attention = await waitForDom(() => {
    const row = replaceSettings.querySelector(
      `[data-ui-extension="${expected.pluginId}@${expected.v2Version}"]`,
    );
    const retry = row?.querySelector("[data-ui-extension-retry]");
    const diagnostic = row?.querySelector("[role=status]")?.textContent ?? "";
    const error = replaceSettings.querySelector("[data-ui-extension-error]")
      ?.textContent ?? "";
    const status = replaceSettings.querySelector("[data-ui-extension-status]")
      ?.textContent ?? "";
    return row instanceof HTMLElement &&
        row.querySelector('em[data-state="attention_required"]') !== null &&
        retry instanceof HTMLButtonElement &&
        !retry.disabled &&
        diagnostic.includes("Plugin command catalog refresh failed") &&
        error.includes("Plugin command catalog refresh failed") &&
        status.includes("loading needs attention")
      ? { row, retry }
      : undefined;
  }, 15_000, "v2_attention");
  const attentionVisible = attention.row.querySelector(
    'em[data-state="attention_required"]',
  ) !== null;
  const attentionDiagnosticVisible = attention.row.textContent?.includes(
    "Plugin command catalog refresh failed",
  ) === true;
  const retryAvailable = !attention.retry.disabled;
  attention.retry.click();
  const v2Row = await waitForDom(() => {
    const row = replaceSettings.querySelector(
      `[data-ui-extension="${expected.pluginId}@${expected.v2Version}"]`,
    );
    const status = replaceSettings.querySelector("[data-ui-extension-status]")
      ?.textContent ?? "";
    return row instanceof HTMLElement &&
        row.querySelector('em[data-state="loaded"]') !== null &&
        row.querySelector("[data-ui-extension-retry]") === null &&
        status.includes("catalog refreshed")
      ? row
      : undefined;
  }, 15_000, "v2_retry");
  const retryRecovered = v2Row.querySelector('em[data-state="loaded"]') !== null;
  const replacedV1 = await waitForExtensionState(
    replaceSettings,
    expected.pluginId,
    expected.v1Version,
    "disabled",
    "v1_replaced",
  );
  const v2Installed = v2Row.getAttribute("data-ui-extension-state") === "installed";
  const v1DisabledAfterReplacement =
    replacedV1.getAttribute("data-ui-extension-state") === "disabled";
  const singleActiveVersion = extensionRows(replaceSettings).filter((row) =>
    row.getAttribute("data-ui-extension-state") === "installed"
  ).length === 1;
  closeSettings(replaceSettings);
  const v2CommandExecuted = await executeCommand(
    ready.surface,
    expected.commandId,
    "v2_command",
  );
  const settledAt = performance.now();
  const privacy = privacyEvidence();

  return {
    ok:
      initialEmptyStateVisible &&
      cancelReviewEvidenceVisible &&
      reviewCancelled &&
      cancelledReviewNotInstalled &&
      v1Installed &&
      v1CommandAvailable &&
      v1CommandExecuted &&
      v1Disabled &&
      commandAbsentWhileDisabled &&
      v1Enabled &&
      commandReturnedAfterEnable &&
      v2ReviewEvidenceVisible &&
      attentionVisible &&
      attentionDiagnosticVisible &&
      retryAvailable &&
      retryRecovered &&
      v2Installed &&
      v1DisabledAfterReplacement &&
      singleActiveVersion &&
      v2CommandExecuted &&
      privacy.providerEvidenceRedacted &&
      privacy.pathEvidenceHidden &&
      privacy.internalIdentityEvidenceHidden,
    step: "relaunch-plugin-install",
    pluginId: expected.pluginId,
    commandId: expected.commandId,
    v1Version: expected.v1Version,
    v2Version: expected.v2Version,
    initialEmptyStateVisible,
    cancelReviewEvidenceVisible,
    reviewCancelled,
    cancelledReviewNotInstalled,
    v1Installed,
    v1CommandAvailable,
    v1CommandExecuted,
    v1Disabled,
    commandAbsentWhileDisabled,
    v1Enabled,
    commandReturnedAfterEnable,
    v2ReviewEvidenceVisible,
    attentionVisible,
    attentionDiagnosticVisible,
    retryAvailable,
    retryRecovered,
    v2Installed,
    v1DisabledAfterReplacement,
    singleActiveVersion,
    v2CommandExecuted,
    ...privacy,
    timingsMs: {
      rendererInteractive,
      conversationSettlement: settledAt - firstExecutionStartedAt,
      rendererPostSettlement: performance.now() - settledAt,
    },
  };

  async function productReady(stage: string) {
    return await waitForDom(() => {
      const surface = document.querySelector("[data-ui-product-shell]");
      const settings = surface?.querySelector('[data-ui-action="open-settings"]');
      return surface instanceof HTMLElement &&
          settings instanceof HTMLButtonElement &&
          !settings.disabled
        ? { surface, settings }
        : undefined;
    }, 10_000, stage);
  }

  async function openSettings(
    surface: HTMLElement,
    opener: HTMLButtonElement,
  ): Promise<HTMLElement> {
    opener.click();
    return await waitForDom(() => {
      const panel = surface.querySelector("[data-ui-settings-panel]");
      const extensions = panel?.querySelector("[data-ui-extension-settings]");
      return panel instanceof HTMLElement && extensions instanceof HTMLElement
        ? panel
        : undefined;
    }, 10_000, "settings_open");
  }

  function closeSettings(settings: HTMLElement): void {
    const close = settings.querySelector('button[aria-label="Close settings"]');
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Plugin proof settings close control is unavailable");
    }
    close.click();
  }

  async function requestReview(
    settings: HTMLElement,
    proof: WanexDesktopPluginProofExpected,
    version: string,
    stage: string,
  ): Promise<{ readonly review: HTMLElement }> {
    const add = settings.querySelector("[data-ui-extension-add]");
    if (!(add instanceof HTMLButtonElement) || add.disabled) {
      throw new Error(`Plugin proof add control is unavailable during ${stage}`);
    }
    add.click();
    const review = await waitForDom(() => {
      const error = settings.querySelector("[data-ui-extension-error]")
        ?.textContent?.trim();
      if (error !== undefined && error.length > 0) {
        throw new Error(`Plugin proof ${stage} rejected: ${error}`);
      }
      const candidate = settings.querySelector("[data-ui-extension-review]");
      return candidate instanceof HTMLElement &&
          candidate.textContent?.includes(proof.pluginId) === true &&
          candidate.textContent?.includes(version) === true
        ? candidate
        : undefined;
    }, 10_000, stage);
    return { review };
  }

  function reviewEvidenceVisible(
    review: HTMLElement,
    proof: WanexDesktopPluginProofExpected,
    version: string,
  ): boolean {
    const digest = review.querySelector("dd[title]")?.getAttribute("title") ?? "";
    const text = review.textContent ?? "";
    return text.includes("Proof Extension") &&
      text.includes(proof.pluginId) &&
      text.includes(version) &&
      text.includes("Proof extension echo") &&
      text.includes("Read configuration") &&
      text.includes("No dependencies declared") &&
      text.includes("Unsigned local code") &&
      /^[a-f0-9]{64}$/.test(digest);
  }

  function approveReview(review: HTMLElement): void {
    const approve = review.querySelector("[data-ui-extension-approve]");
    if (!(approve instanceof HTMLButtonElement) || approve.disabled) {
      throw new Error("Plugin proof approve control is unavailable");
    }
    approve.click();
  }

  function extensionRows(root: ParentNode): HTMLElement[] {
    return [...root.querySelectorAll("[data-ui-extension]")].filter(
      (row): row is HTMLElement => row instanceof HTMLElement,
    );
  }

  function requiredExtensionRow(
    root: ParentNode,
    pluginId: string,
    version: string,
  ): HTMLElement {
    const row = root.querySelector(
      `[data-ui-extension="${pluginId}@${version}"]`,
    );
    if (!(row instanceof HTMLElement)) {
      throw new Error(`Plugin proof extension row is missing for ${version}`);
    }
    return row;
  }

  async function waitForExtensionState(
    root: ParentNode,
    pluginId: string,
    version: string,
    state: string,
    stage: string,
  ): Promise<HTMLElement> {
    return await waitForDom(() => {
      const row = root.querySelector(
        `[data-ui-extension="${pluginId}@${version}"]`,
      );
      return row instanceof HTMLElement &&
          row.getAttribute("data-ui-extension-state") === state
        ? row
        : undefined;
    }, 15_000, stage);
  }

  function requiredToggle(row: ParentNode): HTMLInputElement {
    const toggle = row.querySelector("[data-ui-extension-toggle]");
    if (!(toggle instanceof HTMLInputElement) || toggle.disabled) {
      throw new Error("Plugin proof extension toggle is unavailable");
    }
    return toggle;
  }

  async function executeCommand(
    surface: HTMLElement,
    commandId: string,
    stage: string,
  ): Promise<boolean> {
    const opener = surface.querySelector('[data-ui-action="open-commands"]');
    if (!(opener instanceof HTMLButtonElement) || opener.disabled) {
      throw new Error(`Plugin proof command opener is unavailable during ${stage}`);
    }
    opener.click();
    const command = await waitForDom(() => {
      const palette = surface.querySelector("[data-ui-command-palette]");
      const candidate = palette?.querySelector(`[data-ui-command="${commandId}"]`);
      return palette instanceof HTMLElement && candidate instanceof HTMLButtonElement
        ? candidate
        : undefined;
    }, 10_000, `${stage}_catalog`);
    command.click();
    const execute = await waitForDom(() => {
      const preview = surface.querySelector('[data-ui-command-preview="runnable"]');
      const button = preview === null
        ? undefined
        : [...preview.querySelectorAll("button")].find((candidate) =>
            candidate.textContent?.trim() === "Execute"
          );
      return button instanceof HTMLButtonElement && !button.disabled
        ? button
        : undefined;
    }, 10_000, `${stage}_preview`);
    execute.click();
    const done = await waitForDom(() => {
      const execution = surface.querySelector(
        '[data-ui-command-execution="succeeded"]',
      );
      const button = execution === null
        ? undefined
        : [...execution.querySelectorAll("button")].find((candidate) =>
            candidate.textContent?.trim() === "Done"
          );
      return execution instanceof HTMLElement &&
          execution.textContent?.includes("Execution succeeded") === true &&
          button instanceof HTMLButtonElement
        ? button
        : undefined;
    }, 15_000, `${stage}_execution`);
    done.click();
    await waitForDom(
      () => surface.querySelector("[data-ui-command-palette]") === null
        ? true
        : undefined,
      5_000,
      `${stage}_close`,
    );
    return true;
  }

  async function commandAbsent(
    surface: HTMLElement,
    commandId: string,
    stage: string,
  ): Promise<boolean> {
    const opener = surface.querySelector('[data-ui-action="open-commands"]');
    if (!(opener instanceof HTMLButtonElement) || opener.disabled) {
      throw new Error("Plugin proof command opener is unavailable");
    }
    opener.click();
    const palette = await waitForDom(() => {
      const candidate = surface.querySelector("[data-ui-command-palette]");
      return candidate instanceof HTMLElement ? candidate : undefined;
    }, 10_000, stage);
    const absent = palette.querySelector(`[data-ui-command="${commandId}"]`) === null;
    const close = palette.querySelector('button[aria-label="Close commands"]');
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Plugin proof command close control is unavailable");
    }
    close.click();
    return absent;
  }

  function privacyEvidence() {
    const html = document.documentElement.innerHTML;
    return {
      providerEvidenceRedacted: !html.includes("secretRef"),
      pathEvidenceHidden: [
        "plugin-host",
        "installBaseDir",
        "rootDir",
        "sourceDir",
        "file://",
        "/tmp/",
        "\\\\AppData\\\\",
      ].every((fragment) => !html.includes(fragment)),
      internalIdentityEvidenceHidden: [
        "reviewId",
        "jobId",
        "attemptId",
        "workerId",
        "principalId",
      ].every((fragment) => !html.includes(fragment)),
    };
  }

  function waitForDom<T>(
    read: () => T | undefined,
    timeoutMs: number,
    stage: string,
  ): Promise<T> {
    const initial = read();
    if (initial !== undefined) return Promise.resolve(initial);
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        try {
          const value = read();
          if (value === undefined) return;
          clearTimeout(timeout);
          observer.disconnect();
          resolve(value);
        } catch (error) {
          clearTimeout(timeout);
          observer.disconnect();
          reject(error);
        }
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Plugin proof timed out during ${stage}`));
      }, timeoutMs);
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  }
}

export async function runWanexDesktopPluginRestoreProof(
  expected: WanexDesktopPluginProofExpected,
): Promise<WanexDesktopPluginRestoreProofResult> {
  const startedAt = performance.now();
  const surface = await waitForDom(() => {
    const candidate = document.querySelector("[data-ui-product-shell]");
    const settings = candidate?.querySelector('[data-ui-action="open-settings"]');
    return candidate instanceof HTMLElement &&
        settings instanceof HTMLButtonElement &&
        !settings.disabled
      ? { candidate, settings }
      : undefined;
  }, 10_000, "restore_product_ready");
  const rendererInteractive = performance.now() - startedAt;
  surface.settings.click();
  let settings = await waitForDom(() => {
    const panel = surface.candidate.querySelector("[data-ui-settings-panel]");
    return panel instanceof HTMLElement &&
        panel.querySelector("[data-ui-extension-settings]") !== null
      ? panel
      : undefined;
  }, 10_000, "restore_settings_open");
  const reviewTransientAbsent =
    settings.querySelector("[data-ui-extension-review]") === null;
  const add = settings.querySelector("[data-ui-extension-add]");
  const busyTransientAbsent = add instanceof HTMLButtonElement && !add.disabled &&
    settings.querySelector("[data-ui-extension-error]") === null;
  const v1 = await waitForState(expected.v1Version, "disabled", "restore_v1");
  const v2 = await waitForState(expected.v2Version, "installed", "restore_v2");
  const v1DisabledRestored = state(v1) === "disabled";
  const v2InstalledRestored = state(v2) === "installed";
  const singleActiveVersionRestored = rows().filter((row) =>
    state(row) === "installed"
  ).length === 1;
  closeSettings();

  const commandStartedAt = performance.now();
  const commandRestored = await executeCommand("restored_command");
  const restoredCommandExecuted = commandRestored;
  settings = await openSettings();
  const v2Removed = await removeVersion(expected.v2Version, "remove_v2");
  const v1Removed = await removeVersion(expected.v1Version, "remove_v1");
  const canonicalRemovedStateVisible = rows().filter((row) =>
    state(row) === "removed"
  ).length === 2;
  closeSettings();
  const commandAbsentAfterRemoval = await commandAbsent("removed_command_absent");
  const settledAt = performance.now();
  const privacy = privacyEvidence();

  return {
    ok:
      reviewTransientAbsent &&
      busyTransientAbsent &&
      v1DisabledRestored &&
      v2InstalledRestored &&
      singleActiveVersionRestored &&
      commandRestored &&
      restoredCommandExecuted &&
      v2Removed &&
      v1Removed &&
      canonicalRemovedStateVisible &&
      commandAbsentAfterRemoval &&
      privacy.providerEvidenceRedacted &&
      privacy.pathEvidenceHidden &&
      privacy.internalIdentityEvidenceHidden,
    step: "relaunch-plugin-restore",
    pluginId: expected.pluginId,
    commandId: expected.commandId,
    v1Version: expected.v1Version,
    v2Version: expected.v2Version,
    reviewTransientAbsent,
    busyTransientAbsent,
    v1DisabledRestored,
    v2InstalledRestored,
    singleActiveVersionRestored,
    commandRestored,
    restoredCommandExecuted,
    v2Removed,
    v1Removed,
    canonicalRemovedStateVisible,
    commandAbsentAfterRemoval,
    ...privacy,
    timingsMs: {
      rendererInteractive,
      conversationSettlement: settledAt - commandStartedAt,
      rendererPostSettlement: performance.now() - settledAt,
    },
  };

  async function openSettings(): Promise<HTMLElement> {
    surface.settings.click();
    return await waitForDom(
      () => {
        const panel = surface.candidate.querySelector("[data-ui-settings-panel]");
        return panel instanceof HTMLElement &&
            panel.querySelector("[data-ui-extension-settings]") !== null
          ? panel
          : undefined;
      },
      10_000,
      "restore_settings_reopen",
    );
  }

  function closeSettings(): void {
    const close = settings.querySelector('button[aria-label="Close settings"]');
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Plugin restore settings close control is unavailable");
    }
    close.click();
  }

  function rows(): HTMLElement[] {
    return [...settings.querySelectorAll("[data-ui-extension]")].filter(
      (row): row is HTMLElement => row instanceof HTMLElement,
    );
  }

  function row(version: string): HTMLElement | undefined {
    const candidate = settings.querySelector(
      `[data-ui-extension="${expected.pluginId}@${version}"]`,
    );
    return candidate instanceof HTMLElement ? candidate : undefined;
  }

  function state(value: HTMLElement): string | null {
    return value.getAttribute("data-ui-extension-state");
  }

  async function waitForState(
    version: string,
    expectedState: string,
    stage: string,
  ): Promise<HTMLElement> {
    return await waitForDom(() => {
      const candidate = row(version);
      return candidate !== undefined && state(candidate) === expectedState
        ? candidate
        : undefined;
    }, 15_000, stage);
  }

  async function removeVersion(version: string, stage: string): Promise<boolean> {
    const candidate = row(version);
    const remove = candidate?.querySelector("[data-ui-extension-remove]");
    if (!(remove instanceof HTMLButtonElement) || remove.disabled) {
      throw new Error(`Plugin restore remove control is unavailable for ${version}`);
    }
    remove.click();
    const confirm = await waitForDom(() => {
      const button = settings.querySelector("[data-ui-extension-remove-confirm]");
      return button instanceof HTMLButtonElement && !button.disabled
        ? button
        : undefined;
    }, 5_000, `${stage}_confirm`);
    confirm.click();
    const removed = await waitForState(version, "removed", stage);
    await waitForDom(
      () => settings.querySelector("[data-ui-extension-remove-dialog]") === null
        ? true
        : undefined,
      5_000,
      `${stage}_dialog_close`,
    );
    return state(removed) === "removed" &&
      removed.querySelector("[data-ui-extension-remove]") === null;
  }

  async function executeCommand(stage: string): Promise<boolean> {
    const opener = surface.candidate.querySelector(
      '[data-ui-action="open-commands"]',
    );
    if (!(opener instanceof HTMLButtonElement) || opener.disabled) {
      throw new Error("Plugin restore command opener is unavailable");
    }
    opener.click();
    const command = await waitForDom(() => {
      const palette = surface.candidate.querySelector("[data-ui-command-palette]");
      const candidate = palette?.querySelector(
        `[data-ui-command="${expected.commandId}"]`,
      );
      return candidate instanceof HTMLButtonElement ? candidate : undefined;
    }, 10_000, `${stage}_catalog`);
    command.click();
    const execute = await waitForDom(() => {
      const preview = surface.candidate.querySelector(
        '[data-ui-command-preview="runnable"]',
      );
      const button = preview === null
        ? undefined
        : [...preview.querySelectorAll("button")].find((candidate) =>
            candidate.textContent?.trim() === "Execute"
          );
      return button instanceof HTMLButtonElement && !button.disabled
        ? button
        : undefined;
    }, 10_000, `${stage}_preview`);
    execute.click();
    const done = await waitForDom(() => {
      const execution = surface.candidate.querySelector(
        '[data-ui-command-execution="succeeded"]',
      );
      const button = execution === null
        ? undefined
        : [...execution.querySelectorAll("button")].find((candidate) =>
            candidate.textContent?.trim() === "Done"
          );
      return button instanceof HTMLButtonElement &&
          execution?.textContent?.includes("Execution succeeded") === true
        ? button
        : undefined;
    }, 15_000, `${stage}_execution`);
    done.click();
    await waitForDom(
      () => surface.candidate.querySelector("[data-ui-command-palette]") === null
        ? true
        : undefined,
      5_000,
      `${stage}_close`,
    );
    return true;
  }

  async function commandAbsent(stage: string): Promise<boolean> {
    const opener = surface.candidate.querySelector(
      '[data-ui-action="open-commands"]',
    );
    if (!(opener instanceof HTMLButtonElement) || opener.disabled) {
      throw new Error("Plugin restore command opener is unavailable");
    }
    opener.click();
    const palette = await waitForDom(() => {
      const candidate = surface.candidate.querySelector("[data-ui-command-palette]");
      return candidate instanceof HTMLElement ? candidate : undefined;
    }, 10_000, stage);
    const absent = palette.querySelector(
      `[data-ui-command="${expected.commandId}"]`,
    ) === null;
    const close = palette.querySelector('button[aria-label="Close commands"]');
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Plugin restore command close control is unavailable");
    }
    close.click();
    return absent;
  }

  function privacyEvidence() {
    const html = document.documentElement.innerHTML;
    return {
      providerEvidenceRedacted: !html.includes("secretRef"),
      pathEvidenceHidden: [
        "plugin-host",
        "installBaseDir",
        "rootDir",
        "sourceDir",
        "file://",
        "/tmp/",
        "\\\\AppData\\\\",
      ].every((fragment) => !html.includes(fragment)),
      internalIdentityEvidenceHidden: [
        "reviewId",
        "jobId",
        "attemptId",
        "workerId",
        "principalId",
      ].every((fragment) => !html.includes(fragment)),
    };
  }

  function waitForDom<T>(
    read: () => T | undefined,
    timeoutMs: number,
    stage: string,
  ): Promise<T> {
    const initial = read();
    if (initial !== undefined) return Promise.resolve(initial);
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        try {
          const value = read();
          if (value === undefined) return;
          clearTimeout(timeout);
          observer.disconnect();
          resolve(value);
        } catch (error) {
          clearTimeout(timeout);
          observer.disconnect();
          reject(error);
        }
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Plugin restore proof timed out during ${stage}`));
      }, timeoutMs);
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  }
}
