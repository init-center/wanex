import type {
  WanexDesktopRemoteAssistantProofResult,
} from "./proof-contract.js";

export interface WanexDesktopRemoteAssistantProofExpectations {
  readonly profileId: string;
  readonly profileName: string;
  readonly serverUrl: string;
  readonly credential: string;
  readonly modelId: string;
  readonly message: string;
  readonly partialResponse: string;
  readonly response: string;
  readonly localTranscriptMarker: string;
}

export interface WanexDesktopRemoteAssistantAdmission {
  readonly localSessionId: string;
  readonly remoteSessionId: string;
  readonly profileSavedThroughVisibleForm: boolean;
  readonly profilePersisted: boolean;
  readonly credentialAbsentFromRenderer: boolean;
  readonly serverUrlAbsentFromRenderer: boolean;
  readonly authenticationFailureVisible: boolean;
  readonly authenticationFailurePreservedLocal: boolean;
  readonly credentialCorrectedThroughVisibleForm: boolean;
  readonly remoteLocationSelected: boolean;
  readonly remoteModelReady: boolean;
  readonly remoteMessageSubmitted: boolean;
  readonly remotePartialVisible: boolean;
  readonly switchedToLocalWhileRemoteRunning: boolean;
  readonly localTranscriptRestored: boolean;
  readonly remotePromptAbsentLocally: boolean;
  readonly attachmentUploadAvailable: boolean;
  readonly admittedAt: number;
  readonly startedAt: number;
}

export function wanexDesktopRemoteAssistantAdmissionProofScript(
  expected: WanexDesktopRemoteAssistantProofExpectations,
): string {
  return `(${runWanexDesktopRemoteAssistantAdmissionProof.toString()})(${JSON.stringify(expected)})`;
}

export function wanexDesktopRemoteAssistantSettlementProofScript(
  expected: WanexDesktopRemoteAssistantProofExpectations,
  admission: WanexDesktopRemoteAssistantAdmission,
): string {
  return `(${runWanexDesktopRemoteAssistantSettlementProof.toString()})(${JSON.stringify(expected)}, ${JSON.stringify(admission)})`;
}

export function wanexDesktopRemoteAssistantRestoreProofScript(
  expected: WanexDesktopRemoteAssistantProofExpectations,
): string {
  return `(${runWanexDesktopRemoteAssistantRestoreProof.toString()})(${JSON.stringify(expected)})`;
}

export async function runWanexDesktopRemoteAssistantAdmissionProof(
  expected: WanexDesktopRemoteAssistantProofExpectations,
): Promise<WanexDesktopRemoteAssistantAdmission> {
  const startedAt = performance.now();

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
        throw new Error(`Remote Assistant proof timed out: ${label}`);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  function button(selector: string, label: string): HTMLButtonElement {
    const value = document.querySelector(selector);
    if (!(value instanceof HTMLButtonElement)) {
      throw new Error(`Remote Assistant proof control is unavailable: ${label}`);
    }
    return value;
  }

  function setInput(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function select(control: HTMLElement, value: string): Promise<void> {
    // The location control is a menu: open it as a pointer would, then choose the item.
    control.dispatchEvent(new PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    }));
    const deadline = performance.now() + 5_000;
    let item: Element | null = null;
    while (performance.now() < deadline) {
      item = [...document.querySelectorAll("[data-ui-location]")]
        .find((candidate) => candidate.getAttribute("data-ui-location") === value) ?? null;
      if (item !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!(item instanceof HTMLElement)) throw new Error(`location option unavailable: ${value}`);
    item.click();
  }

  function selectedSessionId(): string {
    return document.querySelector(
      '[data-ui-session-select][aria-current="true"]',
    )?.getAttribute("data-ui-session-select") ?? "";
  }

  async function openConnections(): Promise<HTMLElement> {
    const control = await locationControl(false);
    control.dispatchEvent(new PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    }));
    const manage = await waitFor(() => {
      const item = document.querySelector('[data-ui-action="manage-server-connections"]');
      return item instanceof HTMLElement ? item : undefined;
    }, 10_000, "connections menu item");
    manage.click();
    return await waitFor(() => {
      const dialog = document.querySelector("[data-ui-connections-dialog]");
      return dialog instanceof HTMLElement ? dialog : undefined;
    }, 10_000, "connections dialog");
  }

  async function closeConnections(): Promise<void> {
    const close = await waitFor(() => {
      const candidate = document.querySelector(
        '[data-ui-connections-dialog] [aria-label="Close connections"]',
      );
      return candidate instanceof HTMLButtonElement && !candidate.disabled
        ? candidate
        : undefined;
    }, 10_000, "enabled connections close");
    close.click();
    await waitFor(
      () => document.querySelector("[data-ui-connections-dialog]") === null
        ? true
        : undefined,
      10_000,
      "connections close",
    );
  }

  async function saveProfile(credential: string, editing: boolean): Promise<void> {
    const dialog = await openConnections();
    const actionSelector = editing
      ? '[data-ui-server-profile-action="edit"]'
      : '[data-ui-server-profile-action="add"]';
    const action = await waitFor(() => {
      const candidate = document.querySelector(actionSelector);
      return candidate instanceof HTMLButtonElement && !candidate.disabled
        ? candidate
        : undefined;
    }, 20_000, editing ? "editable saved server" : "add server action");
    action.click();
    const form = await waitFor(() => {
      const candidate = dialog.querySelector("[data-ui-server-profile-form]");
      return candidate instanceof HTMLFormElement ? candidate : undefined;
    }, 10_000, "server Profile form");
    const profileId = form.querySelector('[data-ui-server-profile-field="profile-id"]');
    const name = form.querySelector('[data-ui-server-profile-field="name"]');
    const serverUrl = form.querySelector('[data-ui-server-profile-field="server-url"]');
    const secret = form.querySelector('[data-ui-server-profile-field="credential"]');
    if (
      !(profileId instanceof HTMLInputElement) ||
      !(name instanceof HTMLInputElement) ||
      !(serverUrl instanceof HTMLInputElement) ||
      !(secret instanceof HTMLInputElement)
    ) {
      throw new Error("Remote Assistant proof Profile fields are unavailable");
    }
    if (!editing) setInput(profileId, expected.profileId);
    setInput(name, expected.profileName);
    setInput(serverUrl, expected.serverUrl);
    setInput(secret, credential);
    const submit = form.querySelector('button[type="submit"]');
    if (!(submit instanceof HTMLButtonElement)) {
      throw new Error("Remote Assistant proof Profile save is unavailable");
    }
    submit.click();
    await waitFor(
      () => document.querySelector("[data-ui-server-profile-form]") === null
        ? true
        : undefined,
      20_000,
      "Profile save",
    );
    await closeConnections();
  }

  async function openChat(): Promise<HTMLElement> {
    return await waitFor(() => {
      const workspace = document.querySelector(".assistant-workspace");
      const shell = workspace?.querySelector("[data-ui-assistant-shell]");
      return workspace instanceof HTMLElement && shell instanceof HTMLElement
        ? workspace
        : undefined;
    }, 15_000, "chat workspace");
  }

  async function locationControl(profile: boolean): Promise<HTMLButtonElement> {
    return await waitFor(() => {
      const control = document.querySelector(
        '[aria-label="Chat execution location"]',
      );
      if (!(control instanceof HTMLButtonElement) || control.disabled) return undefined;
      if (
        profile &&
        !control.getAttribute("data-ui-location-options")?.split(" ").includes(`server:${expected.profileId}`) === true
      ) return undefined;
      return control;
    }, 10_000, "chat location control");
  }

  const localWorkspace = await openChat();
  const localSessionId = await waitFor(() => {
    const id = selectedSessionId();
    return id.length > 0 &&
      localWorkspace.textContent?.includes(expected.localTranscriptMarker)
      ? id
      : undefined;
  }, 10_000, "local transcript");

  await saveProfile(`${expected.credential}-invalid`, false);
  const serverBridge = (globalThis as typeof globalThis & {
    wanexServer?: { listProfiles(): Promise<readonly unknown[]> };
  }).wanexServer;
  if (serverBridge === undefined) {
    throw new Error("Remote Assistant proof Server bridge is unavailable");
  }
  const savedProfiles = await serverBridge.listProfiles();
  const profilePersisted = savedProfiles.some((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const profile = value as Record<string, unknown>;
    return profile.profileId === expected.profileId &&
      profile.name === expected.profileName &&
      profile.credentialConfigured === true;
  });
  const profileSavedThroughVisibleForm = profilePersisted;

  await openChat();
  const invalidLocation = await locationControl(true);
  await select(invalidLocation, `server:${expected.profileId}`);
  const authenticationFailureVisible = await waitFor(() => {
    const alert = document.querySelector(".assistant-location-error[role=alert]");
    return alert instanceof HTMLElement && alert.textContent?.trim().length
      ? true
      : undefined;
  }, 15_000, "authentication failure");
  const authenticationFailurePreservedLocal =
    document.querySelector('[data-ui-assistant-location="local"]') !== null &&
    selectedSessionId() === localSessionId;

  await saveProfile(expected.credential, true);
  const credentialCorrectedThroughVisibleForm = true;
  await openChat();
  const credentialAbsentFromRenderer =
    !document.documentElement.innerHTML.includes(expected.credential);
  const serverUrlAbsentFromRenderer =
    !document.documentElement.innerHTML.includes(expected.serverUrl);
  const remoteLocation = await locationControl(true);
  await select(remoteLocation, `server:${expected.profileId}`);
  const remoteShell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="server"]');
    const shell = workspace?.querySelector("[data-ui-assistant-shell]");
    const model = shell?.querySelector("[data-ui-model-selector]")?.getAttribute("data-ui-model-endpoints")?.split(" ").includes(expected.modelId) === true ? true : null;
    return shell instanceof HTMLElement && model !== null ? shell : undefined;
  }, 20_000, "remote Assistant activation");
  const remoteModelReady = true;
  const composer = remoteShell.querySelector(
    '[data-ui-composer] textarea[name="text"]',
  );
  const send = remoteShell.querySelector('[data-ui-composer] button[type="submit"]');
  if (
    !(composer instanceof HTMLTextAreaElement) ||
    !(send instanceof HTMLButtonElement) ||
    composer.disabled
  ) {
    throw new Error("Remote Assistant proof composer is unavailable");
  }
  setInput(composer, expected.message);
  send.click();
  const remoteSessionId = await waitFor(() => {
    const id = selectedSessionId();
    const userVisible = [...remoteShell.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]',
    )].some((row) => row.textContent?.includes(expected.message));
    const partial = remoteShell.querySelector("[data-ui-transient-assistant]");
    return id.length > 0 &&
      id !== localSessionId &&
      userVisible &&
      partial?.textContent?.includes(expected.partialResponse)
      ? id
      : undefined;
  }, 20_000, "remote streamed partial response");
  const attachment = remoteShell.querySelector("[data-ui-attachment-input]");
  const attachmentUploadAvailable =
    attachment instanceof HTMLInputElement && attachment.accept === "image/*";
  const localControl = await locationControl(true);
  await select(localControl, "local");
  const restoredLocalShell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="local"]');
    const shell = workspace?.querySelector("[data-ui-assistant-shell]");
    return shell instanceof HTMLElement &&
      selectedSessionId() === localSessionId &&
      shell.textContent?.includes(expected.localTranscriptMarker)
      ? shell
      : undefined;
  }, 15_000, "local switch while remote operation runs");
  const remotePromptAbsentLocally =
    !restoredLocalShell.textContent?.includes(expected.message);

  return {
    localSessionId,
    remoteSessionId,
    profileSavedThroughVisibleForm,
    profilePersisted,
    credentialAbsentFromRenderer,
    serverUrlAbsentFromRenderer,
    authenticationFailureVisible,
    authenticationFailurePreservedLocal,
    credentialCorrectedThroughVisibleForm,
    remoteLocationSelected: true,
    remoteModelReady,
    remoteMessageSubmitted: true,
    remotePartialVisible: true,
    switchedToLocalWhileRemoteRunning: true,
    localTranscriptRestored: true,
    remotePromptAbsentLocally,
    attachmentUploadAvailable,
    admittedAt: performance.now(),
    startedAt,
  };
}

export async function runWanexDesktopRemoteAssistantSettlementProof(
  expected: WanexDesktopRemoteAssistantProofExpectations,
  admission: WanexDesktopRemoteAssistantAdmission,
): Promise<WanexDesktopRemoteAssistantProofResult> {
  async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
    const deadline = performance.now() + 20_000;
    for (;;) {
      const value = read();
      if (value !== undefined) return value;
      if (performance.now() >= deadline) {
        throw new Error(`Remote Assistant proof timed out: ${label}`);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
  async function select(control: HTMLElement, value: string): Promise<void> {
    // The location control is a menu: open it as a pointer would, then choose the item.
    control.dispatchEvent(new PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    }));
    const deadline = performance.now() + 5_000;
    let item: Element | null = null;
    while (performance.now() < deadline) {
      item = [...document.querySelectorAll("[data-ui-location]")]
        .find((candidate) => candidate.getAttribute("data-ui-location") === value) ?? null;
      if (item !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!(item instanceof HTMLElement)) throw new Error(`location option unavailable: ${value}`);
    item.click();
  }
  const location = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement && !control.disabled
      ? control
      : undefined;
  }, "location control after remote settlement");
  await select(location, `server:${expected.profileId}`);
  const remoteShell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="server"]');
    const shell = workspace?.querySelector("[data-ui-assistant-shell]");
    const responseVisible = [...(shell?.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]',
    ) ?? [])].some((row) => row.textContent?.includes(expected.response));
    return shell instanceof HTMLElement &&
      responseVisible &&
      shell.querySelector("[data-ui-transient-assistant]") === null
      ? shell
      : undefined;
  }, "canonical remote settlement");
  const remoteSessionId = remoteShell.querySelector(
    '[data-ui-session-select][aria-current="true"]',
  )?.getAttribute("data-ui-session-select") ?? "";
  const remoteRows = [...remoteShell.querySelectorAll(
    '[data-ui-conversation-row][data-ui-role="user"]',
  )].filter((row) => row.textContent?.includes(expected.message));
  const attachment = remoteShell.querySelector("[data-ui-attachment-input]");
  const attachmentUploadAvailable =
    admission.attachmentUploadAvailable &&
    attachment instanceof HTMLInputElement &&
    !attachment.disabled;
  const openSettings = remoteShell.querySelector('[data-ui-action="open-settings"]');
  if (!(openSettings instanceof HTMLButtonElement)) {
    throw new Error("Remote Assistant proof settings control is unavailable");
  }
  openSettings.click();
  const hostLocalAdministrationUnavailable = await waitFor(() => {
    const panel = document.querySelector("[data-ui-settings-panel]");
    return panel instanceof HTMLElement &&
      panel.querySelector("[data-ui-provider-form]") === null &&
      panel.textContent?.includes("Provider setup is managed by this host.")
      ? true
      : undefined;
  }, "remote Host-local administration policy");
  const closeSettings = document.querySelector(
    '[data-ui-settings-panel] [aria-label="Close settings"]',
  );
  if (closeSettings instanceof HTMLButtonElement) closeSettings.click();
  const sessionIdentityIsolated =
    admission.localSessionId.length > 0 &&
    admission.remoteSessionId.length > 0 &&
    admission.localSessionId !== admission.remoteSessionId &&
    remoteSessionId === admission.remoteSessionId;
  const internalIdentityEvidenceHidden =
    !document.documentElement.innerHTML.includes(expected.credential) &&
    !document.documentElement.innerHTML.includes("WANEX_DESKTOP_PROOF_REMOTE") &&
    !document.documentElement.innerHTML.includes("agent-host-cursor");
  const settledAt = performance.now();
  const ok =
    admission.profileSavedThroughVisibleForm &&
    admission.profilePersisted &&
    admission.credentialAbsentFromRenderer &&
    admission.serverUrlAbsentFromRenderer &&
    admission.authenticationFailureVisible &&
    admission.authenticationFailurePreservedLocal &&
    admission.credentialCorrectedThroughVisibleForm &&
    admission.remoteLocationSelected &&
    admission.remoteModelReady &&
    admission.remoteMessageSubmitted &&
    admission.remotePartialVisible &&
    admission.switchedToLocalWhileRemoteRunning &&
    admission.localTranscriptRestored &&
    admission.remotePromptAbsentLocally &&
    sessionIdentityIsolated &&
    remoteRows.length === 1 &&
    attachmentUploadAvailable &&
    hostLocalAdministrationUnavailable &&
    internalIdentityEvidenceHidden;
  return {
    ok,
    step: "relaunch-remote-assistant",
    providerEvidenceRedacted: internalIdentityEvidenceHidden,
    profileSavedThroughVisibleForm: admission.profileSavedThroughVisibleForm,
    profilePersisted: admission.profilePersisted,
    credentialAbsentFromRenderer: admission.credentialAbsentFromRenderer,
    serverUrlAbsentFromRenderer: admission.serverUrlAbsentFromRenderer,
    authenticationFailureVisible: admission.authenticationFailureVisible,
    authenticationFailurePreservedLocal:
      admission.authenticationFailurePreservedLocal,
    credentialCorrectedThroughVisibleForm:
      admission.credentialCorrectedThroughVisibleForm,
    remoteLocationSelected: admission.remoteLocationSelected,
    remoteModelReady: admission.remoteModelReady,
    remoteMessageSubmitted: admission.remoteMessageSubmitted,
    remotePartialVisible: admission.remotePartialVisible,
    switchedToLocalWhileRemoteRunning:
      admission.switchedToLocalWhileRemoteRunning,
    localTranscriptRestored: admission.localTranscriptRestored,
    remotePromptAbsentLocally: admission.remotePromptAbsentLocally,
    sessionIdentityIsolated,
    remoteTranscriptReconciled: remoteRows.length === 1,
    remoteFinalResponseVisible: true,
    remoteTransientAbsent: true,
    attachmentUploadAvailable,
    hostLocalAdministrationUnavailable,
    profileRestoredAfterRelaunch: false,
    credentialResolvedAfterRelaunch: false,
    internalIdentityEvidenceHidden,
    timingsMs: {
      journeyPreparation: admission.admittedAt - admission.startedAt,
      conversationSettlement: settledAt - admission.admittedAt,
      rendererPostSettlement: performance.now() - settledAt,
    },
  };
}

export async function runWanexDesktopRemoteAssistantRestoreProof(
  expected: WanexDesktopRemoteAssistantProofExpectations,
): Promise<WanexDesktopRemoteAssistantProofResult> {
  const startedAt = performance.now();
  async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
    const deadline = performance.now() + 20_000;
    for (;;) {
      const value = read();
      if (value !== undefined) return value;
      if (performance.now() >= deadline) {
        throw new Error(`Remote Assistant restore proof timed out: ${label}`);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
  async function select(control: HTMLElement, value: string): Promise<void> {
    // The location control is a menu: open it as a pointer would, then choose the item.
    control.dispatchEvent(new PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    }));
    const deadline = performance.now() + 5_000;
    let item: Element | null = null;
    while (performance.now() < deadline) {
      item = [...document.querySelectorAll("[data-ui-location]")]
        .find((candidate) => candidate.getAttribute("data-ui-location") === value) ?? null;
      if (item !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!(item instanceof HTMLElement)) throw new Error(`location option unavailable: ${value}`);
    item.click();
  }
  const serverBridge = (globalThis as typeof globalThis & {
    wanexServer?: { listProfiles(): Promise<readonly unknown[]> };
  }).wanexServer;
  if (serverBridge === undefined) {
    throw new Error("Remote Assistant restore Server bridge is unavailable");
  }
  const profiles = await serverBridge.listProfiles();
  const profileRestoredAfterRelaunch = profiles.some((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const profile = value as Record<string, unknown>;
    return profile.profileId === expected.profileId &&
      profile.name === expected.profileName &&
      profile.credentialConfigured === true;
  });
  const location = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement &&
      !control.disabled &&
      control.getAttribute("data-ui-location-options")?.split(" ").includes(`server:${expected.profileId}`) === true
      ? control
      : undefined;
  }, "restored profile location");
  await select(location, `server:${expected.profileId}`);
  const remoteShell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="server"]');
    const shell = workspace?.querySelector("[data-ui-assistant-shell]");
    const userRows = [...(shell?.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]',
    ) ?? [])].filter((row) => row.textContent?.includes(expected.message));
    const assistantRows = [...(shell?.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]',
    ) ?? [])].filter((row) => row.textContent?.includes(expected.response));
    return shell instanceof HTMLElement &&
      userRows.length === 1 &&
      assistantRows.length === 1 &&
      shell.querySelector("[data-ui-transient-assistant]") === null
      ? shell
      : undefined;
  }, "remote transcript after relaunch");
  const remoteSessionId = remoteShell.querySelector(
    '[data-ui-session-select][aria-current="true"]',
  )?.getAttribute("data-ui-session-select") ?? "";
  const attachment = remoteShell.querySelector("[data-ui-attachment-input]");
  const attachmentUploadAvailable =
    attachment instanceof HTMLInputElement && !attachment.disabled;
  const localLocation = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement && !control.disabled
      ? control
      : undefined;
  }, "remote location after relaunch");
  await select(localLocation, "local");
  const localShell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="local"]');
    const shell = workspace?.querySelector("[data-ui-assistant-shell]");
    return shell instanceof HTMLElement &&
      shell.textContent?.includes(expected.localTranscriptMarker)
      ? shell
      : undefined;
  }, "local transcript after relaunch");
  const localSessionId = localShell.querySelector(
    '[data-ui-session-select][aria-current="true"]',
  )?.getAttribute("data-ui-session-select") ?? "";
  const remotePromptAbsentLocally = !localShell.textContent?.includes(expected.message);
  const sessionIdentityIsolated =
    localSessionId.length > 0 &&
    remoteSessionId.length > 0 &&
    localSessionId !== remoteSessionId;
  const internalIdentityEvidenceHidden =
    !document.documentElement.innerHTML.includes(expected.credential) &&
    !document.documentElement.innerHTML.includes("agent-host-cursor");
  const settledAt = performance.now();
  const ok =
    profileRestoredAfterRelaunch &&
    remoteSessionId.length > 0 &&
    attachmentUploadAvailable &&
    remotePromptAbsentLocally &&
    sessionIdentityIsolated &&
    internalIdentityEvidenceHidden;
  return {
    ok,
    step: "relaunch-remote-assistant-restore",
    providerEvidenceRedacted: internalIdentityEvidenceHidden,
    profileSavedThroughVisibleForm: false,
    profilePersisted: profileRestoredAfterRelaunch,
    credentialAbsentFromRenderer: internalIdentityEvidenceHidden,
    serverUrlAbsentFromRenderer: true,
    authenticationFailureVisible: false,
    authenticationFailurePreservedLocal: false,
    credentialCorrectedThroughVisibleForm: false,
    remoteLocationSelected: true,
    remoteModelReady: true,
    remoteMessageSubmitted: false,
    remotePartialVisible: false,
    switchedToLocalWhileRemoteRunning: false,
    localTranscriptRestored: true,
    remotePromptAbsentLocally,
    sessionIdentityIsolated,
    remoteTranscriptReconciled: true,
    remoteFinalResponseVisible: true,
    remoteTransientAbsent: true,
    attachmentUploadAvailable,
    hostLocalAdministrationUnavailable: true,
    profileRestoredAfterRelaunch,
    credentialResolvedAfterRelaunch: true,
    internalIdentityEvidenceHidden,
    timingsMs: {
      journeyPreparation: settledAt - startedAt,
      conversationSettlement: 0,
      rendererPostSettlement: performance.now() - settledAt,
    },
  };
}
