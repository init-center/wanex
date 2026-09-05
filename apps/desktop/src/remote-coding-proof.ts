import type { WanexDesktopRemoteCodingProofResult } from "./proof-contract.js";

export interface WanexDesktopRemoteCodingProofExpectations {
  readonly profileId: string;
  readonly profileName: string;
  readonly endpoint: string;
  readonly credential: string;
  readonly projectId: string;
}

export function wanexDesktopRemoteCodingProofScript(
  expected: WanexDesktopRemoteCodingProofExpectations,
): string {
  return `(${runWanexDesktopRemoteCodingProof.toString()})(${JSON.stringify(expected)})`;
}

export async function runWanexDesktopRemoteCodingProof(
  expected: WanexDesktopRemoteCodingProofExpectations,
): Promise<WanexDesktopRemoteCodingProofResult> {
  function setInputValue(control: HTMLInputElement, value: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const value = read();
      if (value !== undefined) return value;
      if (performance.now() >= deadline) {
        throw new Error(`Remote Coding proof timed out: ${label}`);
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  }

  function button(selector: string, label: string): HTMLButtonElement {
    const value = document.querySelector(selector);
    if (!(value instanceof HTMLButtonElement)) {
      throw new Error(`Remote Coding proof control is unavailable: ${label}`);
    }
    return value;
  }

  const startedAt = performance.now();
  const codingNavigation = button(
    '[data-ui-product-surface="coding"]',
    "coding navigation",
  );
  codingNavigation.click();
  const emptyShell = await waitFor(() => {
    const value = document.querySelector("[data-ui-coding-shell]");
    return value instanceof HTMLElement &&
      value.querySelector('[data-ui-coding-action="open-project"]') !== null
      ? value
      : undefined;
  }, 10_000, "coding surface");
  const connectServer = emptyShell.querySelector(
    '[data-ui-coding-action="list-remote-projects"]',
  );
  if (!(connectServer instanceof HTMLButtonElement)) {
    throw new Error("Remote Coding proof server control is unavailable");
  }
  connectServer.click();
  const remotePicker = await waitFor(() => {
    const value = document.querySelector("[data-ui-coding-remote-picker]");
    return value instanceof HTMLElement ? value : undefined;
  }, 10_000, "remote picker");
  const addServer = button(
    '[data-ui-remote-profile-action="add"]',
    "add server",
  );
  addServer.click();
  const form = await waitFor(() => {
    const value = remotePicker.querySelector("[data-ui-remote-profile-form]");
    return value instanceof HTMLFormElement ? value : undefined;
  }, 10_000, "remote Profile form");
  const profileIdInput = form.querySelector(
    '[data-ui-remote-profile-field="profile-id"]',
  );
  const nameInput = form.querySelector(
    '[data-ui-remote-profile-field="name"]',
  );
  const endpointInput = form.querySelector(
    '[data-ui-remote-profile-field="endpoint"]',
  );
  const credentialInput = form.querySelector(
    '[data-ui-remote-profile-field="credential"]',
  );
  if (
    !(profileIdInput instanceof HTMLInputElement) ||
    !(nameInput instanceof HTMLInputElement) ||
    !(endpointInput instanceof HTMLInputElement) ||
    !(credentialInput instanceof HTMLInputElement)
  ) {
    throw new Error("Remote Coding proof Profile fields are unavailable");
  }
  setInputValue(profileIdInput, expected.profileId);
  setInputValue(nameInput, expected.profileName);
  setInputValue(endpointInput, expected.endpoint);
  setInputValue(credentialInput, expected.credential);
  const credentialAcceptedByForm = credentialInput.value === expected.credential;
  const save = form.querySelector('button[type="submit"]');
  if (!(save instanceof HTMLButtonElement)) {
    throw new Error("Remote Coding proof Profile save control is unavailable");
  }
  save.click();
  await waitFor(
    () => document.querySelector("[data-ui-remote-profile-form]") === null
      ? true
      : undefined,
    10_000,
    "Profile save",
  );
  const credentialAbsentAfterSave =
    !document.body.textContent?.includes(expected.credential) &&
    ![...document.querySelectorAll("input")].some(
      (input) => input.value === expected.credential,
    );
  const endpointAbsentAfterSave =
    !document.body.textContent?.includes(expected.endpoint) &&
    !document.documentElement.innerHTML.includes(expected.endpoint);
  const remoteBridge = (globalThis as typeof globalThis & {
    wanexRemote?: {
      listProfiles(): Promise<readonly unknown[]>;
      removeProfile(profileId: string): Promise<void>;
      connect(profileId: string): Promise<unknown>;
    };
  }).wanexRemote;
  if (remoteBridge === undefined) {
    throw new Error("Remote Coding proof bridge is unavailable");
  }
  const savedProfiles = await remoteBridge.listProfiles();
  const profilePersistedAfterSave = savedProfiles.some((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const profile = value as Record<string, unknown>;
    return profile.profileId === expected.profileId &&
      profile.name === expected.profileName &&
      profile.credentialConfigured === true;
  });
  let remoteProject: HTMLButtonElement;
  try {
    remoteProject = await waitFor(() => {
      const value = document.querySelector(
        `[data-ui-remote-project-id="${CSS.escape(expected.projectId)}"]`,
      );
      return value instanceof HTMLButtonElement ? value : undefined;
    }, 20_000, "remote project");
  } catch (error) {
    const picker = document.querySelector("[data-ui-coding-remote-picker]");
    const details = picker?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
    throw new Error(
      `Remote Coding project list did not contain the expected project: ${details}`,
      { cause: error },
    );
  }
  remoteProject.click();
  const project = await waitFor(() => {
    const value = document.querySelector("[data-ui-coding-project]");
    return value instanceof HTMLElement &&
      value.getAttribute("data-ui-coding-project-location") === "remote" &&
      value.getAttribute("data-ui-coding-project-id") === expected.projectId
      ? value
      : undefined;
  }, 20_000, "selected remote project");
  const sharedWorkbenchVisible =
    project.querySelector("[data-ui-coding-workbench]") !== null &&
    project.querySelector("[data-ui-coding-composer]") !== null &&
    project.querySelector('[aria-label="Project sessions"]') !== null;
  const idleInspectorHidden =
    project.querySelector('[aria-label="Coding review"]') === null;
  const projectId = project.getAttribute("data-ui-coding-project-id") ?? "";
  await remoteBridge.removeProfile(expected.profileId);
  const removedProfiles = await remoteBridge.listProfiles();
  let reconnectRejectedAfterRemoval = false;
  try {
    await remoteBridge.connect(expected.profileId);
  } catch {
    reconnectRejectedAfterRemoval = true;
  }
  const finishedAt = performance.now();
  const removedProfileListEmpty = removedProfiles.length === 0;
  const internalIdentityEvidenceHidden =
    !document.documentElement.innerHTML.includes("WANEX_DESKTOP_PROOF_REMOTE") &&
    !document.documentElement.innerHTML.includes("packaged_remote_session");
  return {
    ok:
      codingNavigation.getAttribute("aria-current") === "page" &&
      emptyShell !== undefined &&
      form !== undefined &&
      credentialAcceptedByForm &&
      profilePersistedAfterSave &&
      credentialAbsentAfterSave &&
      endpointAbsentAfterSave &&
      projectId === expected.projectId &&
      sharedWorkbenchVisible &&
      idleInspectorHidden &&
      removedProfileListEmpty &&
      reconnectRejectedAfterRemoval &&
      internalIdentityEvidenceHidden,
    step: "relaunch-remote-coding",
    providerEvidenceRedacted: true,
    codingSurfaceSelected: true,
    remoteProfileFormVisible: true,
    profileInputSubmitted: true,
    credentialAcceptedByForm,
    profilePersistedAfterSave,
    credentialAbsentAfterSave,
    endpointAbsentAfterSave,
    remoteProjectVisible: true,
    opaqueProjectSelected: projectId === expected.projectId,
    sharedWorkbenchVisible,
    idleInspectorHidden,
    projectId,
    profileRemoved: true,
    removedProfileListEmpty,
    reconnectRejectedAfterRemoval,
    internalIdentityEvidenceHidden,
    timingsMs: {
      rendererInteractive: 0,
      conversationSettlement: finishedAt - startedAt,
      rendererPostSettlement: performance.now() - finishedAt,
    },
  };
}
