export type WanexDesktopRemoteMediaProofStep =
  | "relaunch-remote-media"
  | "relaunch-remote-media-restore";

export interface WanexDesktopRemoteMediaProofExpected {
  readonly step: WanexDesktopRemoteMediaProofStep;
  readonly profileId: string;
  readonly modelId: string;
  readonly multimodalText: string;
  readonly multimodalResponse: string;
  readonly unsupportedDraft: string;
  readonly imageLabel: string;
  readonly pngBase64: string;
  readonly generationText: string;
  readonly generationResponse: string;
}

interface WanexDesktopRemoteMediaProofBase {
  readonly ok: boolean;
  readonly step: WanexDesktopRemoteMediaProofStep;
  readonly providerEvidenceRedacted: boolean;
  readonly profileRestored: boolean;
  readonly remoteLocationSelected: boolean;
  readonly remoteModelReady: boolean;
  readonly sessionId: string;
  readonly capabilityRetired: boolean;
  readonly remoteEvidenceHidden: boolean;
  readonly timingsMs: {
    readonly journeyPreparation: number;
    readonly conversationSettlement: number;
    readonly rendererPostSettlement: number;
  };
}

export interface WanexDesktopRemoteMediaUploadProofResult
  extends WanexDesktopRemoteMediaProofBase {
  readonly step: "relaunch-remote-media";
  readonly attachmentPickerVisible: boolean;
  readonly unsupportedAttachmentRejected: boolean;
  readonly unsupportedDraftPreserved: boolean;
  readonly attachmentPreviewVisible: boolean;
  readonly attachmentCapabilityUrlLocal: boolean;
  readonly multimodalConversationSubmitted: boolean;
  readonly multimodalResponseVisible: boolean;
  readonly uploadedResourceVisible: boolean;
  readonly imageGenerationToolSucceeded: boolean;
  readonly generatedResourceVisible: boolean;
  readonly generatedResourceEvidenceValid: boolean;
  readonly generatedPreviewVisible: boolean;
  readonly staleUploadRejected: boolean;
  readonly staleUploadAbsent: boolean;
}

export interface WanexDesktopRemoteMediaRestoreProofResult
  extends WanexDesktopRemoteMediaProofBase {
  readonly step: "relaunch-remote-media-restore";
  readonly uploadedTranscriptRestored: boolean;
  readonly uploadedResourceRestored: boolean;
  readonly uploadedPreviewRestored: boolean;
  readonly generatedTranscriptRestored: boolean;
  readonly generatedResourceRestored: boolean;
  readonly generatedPreviewRestored: boolean;
  readonly attachmentDraftEmpty: boolean;
}

export type WanexDesktopRemoteMediaProofResult =
  | WanexDesktopRemoteMediaUploadProofResult
  | WanexDesktopRemoteMediaRestoreProofResult;

export type WanexDesktopRemoteMediaRendererEvidence =
  | (Omit<WanexDesktopRemoteMediaUploadProofResult, "ok" | "capabilityRetired"> & {
      readonly retiredCapabilityUrls: readonly string[];
    })
  | (Omit<WanexDesktopRemoteMediaRestoreProofResult, "ok" | "capabilityRetired"> & {
      readonly retiredCapabilityUrls: readonly string[];
    });

export function wanexDesktopRemoteMediaProofScript(
  expected: WanexDesktopRemoteMediaProofExpected,
): string {
  return `(${runWanexDesktopRemoteMediaProof.toString()})(${JSON.stringify(expected)})`;
}

export async function runWanexDesktopRemoteMediaProof(
  expected: WanexDesktopRemoteMediaProofExpected,
): Promise<WanexDesktopRemoteMediaRendererEvidence> {
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
        throw new Error(`Remote media proof timed out: ${label}`);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  function setInput(control: HTMLTextAreaElement, value: string): void {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(control, value);
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

  function decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function selectAttachment(
    input: HTMLInputElement,
    bytes: Uint8Array,
    mediaType: string,
    name: string,
  ): void {
    const transfer = new DataTransfer();
    const content = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(content).set(bytes);
    transfer.items.add(new File([content], name, { type: mediaType }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function localCapabilityUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "wanex-resource:" &&
        url.hostname === "delivery" &&
        /^\/wrc_[A-Za-z0-9_-]{43}$/u.test(url.pathname) &&
        url.search.length === 0 &&
        url.hash.length === 0;
    } catch {
      return false;
    }
  }

  function currentSessionId(shell: Element): string {
    return shell.querySelector(
      '[data-ui-session-select][aria-current="true"]',
    )?.getAttribute("data-ui-session-select") ?? "";
  }

  function activeComposer(shell: Element): {
    readonly textarea: HTMLTextAreaElement;
    readonly send: HTMLButtonElement;
  } | undefined {
    const textarea = shell.querySelector(
      '[data-ui-composer] textarea[name="text"]',
    );
    const send = shell.querySelector('[data-ui-composer] button[type="submit"]');
    return textarea instanceof HTMLTextAreaElement &&
      !textarea.disabled &&
      send instanceof HTMLButtonElement
      ? { textarea, send }
      : undefined;
  }

  async function submit(
    shell: Element,
    text: string,
    response: string,
  ): Promise<{ readonly sessionId: string; readonly submittedAt: number }> {
    const initialUserIds = new Set(
      [...shell.querySelectorAll('[data-ui-conversation-row][data-ui-role="user"]')]
        .map((row) => row.getAttribute("data-ui-conversation-row") ?? ""),
    );
    const initialAssistantIds = new Set(
      [...shell.querySelectorAll('[data-ui-conversation-row][data-ui-role="assistant"]')]
        .map((row) => row.getAttribute("data-ui-conversation-row") ?? ""),
    );
    const composer = await waitFor(() => activeComposer(shell), 10_000, "composer");
    setInput(composer.textarea, text);
    const send = await waitFor(() => {
      const current = activeComposer(shell)?.send;
      return current !== undefined && !current.disabled ? current : undefined;
    }, 10_000, "send readiness");
    send.click();
    const submittedAt = performance.now();
    const settled = await waitFor(() => {
      const sessionId = currentSessionId(shell);
      const user = [...shell.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]',
      )].find((row) =>
        !initialUserIds.has(row.getAttribute("data-ui-conversation-row") ?? "") &&
        row.textContent?.includes(text)
      );
      const assistant = [...shell.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]',
      )].find((row) =>
        !initialAssistantIds.has(row.getAttribute("data-ui-conversation-row") ?? "") &&
        row.textContent?.includes(response)
      );
      return sessionId.length > 0 && user !== undefined && assistant !== undefined
        ? { sessionId }
        : undefined;
    }, 30_000, `response for ${text}`);
    return { sessionId: settled.sessionId, submittedAt };
  }

  const serverBridge = (globalThis as typeof globalThis & {
    wanexServer?: { listProfiles(): Promise<readonly unknown[]> };
  }).wanexServer;
  const assistantBridge = (globalThis as typeof globalThis & {
    wanexAssistant?: {
      readState(): Promise<{ readonly generation: number }>;
      uploadAttachment(request: {
        readonly generation: number;
        readonly content: Uint8Array;
        readonly mediaType: string;
        readonly kind: "image";
      }): Promise<unknown>;
    };
  }).wanexAssistant;
  if (serverBridge === undefined || assistantBridge === undefined) {
    throw new Error("Remote media proof Desktop bridges are unavailable");
  }
  const profiles = await serverBridge.listProfiles();
  const profileRestored = profiles.some((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const profile = value as Record<string, unknown>;
    return profile.profileId === expected.profileId &&
      profile.credentialConfigured === true;
  });

  const location = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement &&
      !control.disabled &&
      control.getAttribute("data-ui-location-options")?.split(" ").includes(`server:${expected.profileId}`) === true
      ? control
      : undefined;
  }, 15_000, "server location");
  await select(location, `server:${expected.profileId}`);
  const shell = await waitFor(() => {
    const workspace = document.querySelector('[data-ui-assistant-location="server"]');
    const candidate = workspace?.querySelector("[data-ui-assistant-shell]");
    const model = candidate?.querySelector("[data-ui-model-selector]")?.getAttribute("data-ui-model-endpoints")?.split(" ").includes(expected.modelId) === true ? true : null;
    return candidate instanceof HTMLElement && model !== null
      ? candidate
      : undefined;
  }, 20_000, "remote Assistant");

  if (expected.step === "relaunch-remote-media-restore") {
    const restored = await waitFor(() => {
      const sessionId = currentSessionId(shell);
      const userRows = [...shell.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]',
      )];
      const assistantRows = [...shell.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]',
      )];
      const uploadedRow = userRows.find((row) =>
        row.textContent?.includes(expected.multimodalText)
      );
      const uploadedResource = uploadedRow?.querySelector(
        '[data-ui-resource][data-ui-resource-kind="image"]',
      );
      const uploadedPreview = uploadedResource?.querySelector(
        '[data-ui-resource-preview][data-ui-preview-state="ready"] img',
      );
      const uploadedResourceId = uploadedResource?.getAttribute("data-ui-resource") ?? "";
      const generatedResources = [...shell.querySelectorAll(
        '[data-ui-resource][data-ui-resource-kind="image"]',
      )].filter((resource) =>
        resource.getAttribute("data-ui-resource") !== uploadedResourceId
      );
      const generatedResource = generatedResources.length === 1
        ? generatedResources[0]
        : undefined;
      const generatedPreview = generatedResource?.querySelector(
        '[data-ui-resource-preview][data-ui-preview-state="ready"] img',
      );
      if (
        sessionId.length === 0 ||
        !assistantRows.some((row) => row.textContent?.includes(expected.multimodalResponse)) ||
        !assistantRows.some((row) => row.textContent?.includes(expected.generationResponse)) ||
        !(uploadedResource instanceof HTMLElement) ||
        !(uploadedPreview instanceof HTMLImageElement) ||
        !localCapabilityUrl(uploadedPreview.src) ||
        !(generatedResource instanceof HTMLElement) ||
        !(generatedPreview instanceof HTMLImageElement) ||
        !localCapabilityUrl(generatedPreview.src)
      ) return undefined;
      return {
        sessionId,
        uploadedCapabilityUrl: uploadedPreview.src,
        generatedCapabilityUrl: generatedPreview.src,
      };
    }, 30_000, "remote media restore");
    const attachmentDraftEmpty =
      shell.querySelectorAll("[data-ui-attachment]").length === 0;
    const localLocation = await waitFor(() => {
      const control = document.querySelector('[aria-label="Chat execution location"]');
      return control instanceof HTMLButtonElement && !control.disabled
        ? control
        : undefined;
    }, 10_000, "restore location control before retirement");
    await select(localLocation, "local");
    await waitFor(() =>
      document.querySelector('[data-ui-assistant-location="local"]') !== null
        ? true
        : undefined,
    15_000, "restore capability retirement");
    const html = document.documentElement.innerHTML;
    const remoteEvidenceHidden =
      !html.includes("wrd_") &&
      !html.includes("x-wanex-resource-grant") &&
      !html.includes("/v1/assistant/resource") &&
      !html.includes("/v1/assistant/attachment");
    const completedAt = performance.now();
    return {
      step: expected.step,
      providerEvidenceRedacted: remoteEvidenceHidden,
      profileRestored,
      remoteLocationSelected: true,
      remoteModelReady: true,
      sessionId: restored.sessionId,
      uploadedTranscriptRestored: true,
      uploadedResourceRestored: true,
      uploadedPreviewRestored: true,
      generatedTranscriptRestored: true,
      generatedResourceRestored: true,
      generatedPreviewRestored: true,
      attachmentDraftEmpty,
      remoteEvidenceHidden,
      retiredCapabilityUrls: [
        restored.uploadedCapabilityUrl,
        restored.generatedCapabilityUrl,
      ],
      timingsMs: {
        journeyPreparation: completedAt - startedAt,
        conversationSettlement: 0,
        rendererPostSettlement: 0,
      },
    };
  }

  const attachmentInput = async (): Promise<HTMLInputElement> => await waitFor(() => {
    const candidate = shell.querySelector("[data-ui-attachment-input]");
    return candidate instanceof HTMLInputElement &&
      !candidate.disabled &&
      candidate.accept === "image/*"
      ? candidate
      : undefined;
  }, 10_000, "attachment picker");
  const input = await attachmentInput();
  const composer = await waitFor(
    () => activeComposer(shell)?.textarea,
    10_000,
    "attachment composer",
  );
  setInput(composer, expected.unsupportedDraft);
  // The picker is intentionally image-only for this provider. Unsupported
  // document input must be rejected before a server upload is attempted.
  const unsupportedAttachmentRejected = !input.accept.includes("application/pdf");
  const unsupportedDraftPreserved =
    activeComposer(shell)?.textarea.value === expected.unsupportedDraft;

  const png = decodeBase64(expected.pngBase64);
  selectAttachment(
    await attachmentInput(),
    png,
    "image/png",
    expected.imageLabel,
  );
  const attachment = await waitFor(() => {
    const row = shell.querySelector("[data-ui-attachment]");
    const preview = row?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img',
    );
    return row instanceof HTMLElement &&
      preview instanceof HTMLImageElement &&
      localCapabilityUrl(preview.src)
      ? { row, preview }
      : undefined;
  }, 20_000, "remote attachment preview");
  const attachmentResourceId =
    attachment.row.getAttribute("data-ui-resource-id") ?? "";
  const multimodal = await submit(
    shell,
    expected.multimodalText,
    expected.multimodalResponse,
  );
  const uploadedResource = await waitFor(() => {
    const resource = [...shell.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]',
    )]
      .map((row) => row.querySelector(
        `[data-ui-resource="${CSS.escape(attachmentResourceId)}"]`,
      ))
      .find((candidate): candidate is HTMLElement =>
        candidate instanceof HTMLElement
      );
    const preview = resource?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img',
    );
    return resource !== undefined &&
      preview instanceof HTMLImageElement &&
      localCapabilityUrl(preview.src)
      ? { resource, preview }
      : undefined;
  }, 20_000, "canonical uploaded Resource");

  const existingImageResourceIds = new Set(
    [...shell.querySelectorAll('[data-ui-resource][data-ui-resource-kind="image"]')]
      .map((resource) => resource.getAttribute("data-ui-resource") ?? ""),
  );
  const generated = await submit(
    shell,
    expected.generationText,
    expected.generationResponse,
  );
  const generatedResource = await waitFor(() => {
    const tool = shell.querySelector(
      '[data-ui-tool="image_generate"][data-ui-tool-state="succeeded"]',
    );
    const finalResponseVisible = [...shell.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]',
    )].some((candidate) =>
      candidate.textContent?.includes(expected.generationResponse)
    );
    const resources = [...shell.querySelectorAll(
      '[data-ui-resource][data-ui-resource-kind="image"]',
    )].filter((candidate) =>
      !existingImageResourceIds.has(
        candidate.getAttribute("data-ui-resource") ?? "",
      )
    );
    const resource = resources.length === 1 ? resources[0] : undefined;
    const preview = resource?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img',
    );
    const sha256 = resource?.getAttribute("data-ui-resource-sha256") ?? "";
    const sizeBytes = Number(resource?.getAttribute("data-ui-resource-size"));
    return tool !== null &&
      finalResponseVisible &&
      resource instanceof HTMLElement &&
      /^[a-f0-9]{64}$/u.test(sha256) &&
      Number.isSafeInteger(sizeBytes) &&
      sizeBytes > 0 &&
      preview instanceof HTMLImageElement &&
      localCapabilityUrl(preview.src)
      ? { preview }
      : undefined;
  }, 30_000, "generated remote image");
  const settledAt = performance.now();

  const stale = await assistantBridge.readState();
  const localLocation = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement && !control.disabled
      ? control
      : undefined;
  }, 10_000, "location control before local retirement");
  await select(localLocation, "local");
  await waitFor(() =>
    document.querySelector('[data-ui-assistant-location="local"]') !== null
      ? true
      : undefined,
  15_000, "local retirement");
  let staleUploadRejected = false;
  try {
    await assistantBridge.uploadAttachment({
      generation: stale.generation,
      content: png,
      mediaType: "image/png",
      kind: "image",
    });
  } catch (error) {
    staleUploadRejected = error instanceof Error &&
      error.message.includes("generation is stale");
  }
  const serverLocation = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement && !control.disabled
      ? control
      : undefined;
  }, 10_000, "location control before remote reactivation");
  await select(serverLocation, `server:${expected.profileId}`);
  const reactivated = await waitFor(() => {
    const remote = document.querySelector('[data-ui-assistant-location="server"]');
    const activeShell = remote?.querySelector("[data-ui-assistant-shell]");
    return activeShell instanceof HTMLElement ? activeShell : undefined;
  }, 20_000, "remote reactivation");
  const staleUploadAbsent =
    reactivated.querySelectorAll("[data-ui-attachment]").length === 0;
  const localAgain = await waitFor(() => {
    const control = document.querySelector('[aria-label="Chat execution location"]');
    return control instanceof HTMLButtonElement && !control.disabled
      ? control
      : undefined;
  }, 10_000, "final local location");
  await select(localAgain, "local");
  await waitFor(() =>
    document.querySelector('[data-ui-assistant-location="local"]') !== null
      ? true
      : undefined,
  15_000, "final local retirement");
  const html = document.documentElement.innerHTML;
  const remoteEvidenceHidden =
    !html.includes("wrd_") &&
    !html.includes("x-wanex-resource-grant") &&
    !html.includes("/v1/assistant/resource") &&
    !html.includes("/v1/assistant/attachment");
  const completedAt = performance.now();
  return {
    step: expected.step,
    providerEvidenceRedacted: remoteEvidenceHidden,
    profileRestored,
    remoteLocationSelected: true,
    remoteModelReady: true,
    sessionId: generated.sessionId,
    attachmentPickerVisible: true,
    unsupportedAttachmentRejected,
    unsupportedDraftPreserved,
    attachmentPreviewVisible: true,
    attachmentCapabilityUrlLocal: true,
    multimodalConversationSubmitted: true,
    multimodalResponseVisible: true,
    uploadedResourceVisible: true,
    imageGenerationToolSucceeded: true,
    generatedResourceVisible: true,
    generatedResourceEvidenceValid: true,
    generatedPreviewVisible: true,
    staleUploadRejected,
    staleUploadAbsent,
    remoteEvidenceHidden,
    retiredCapabilityUrls: [
      attachment.preview.src,
      uploadedResource.preview.src,
      generatedResource.preview.src,
    ],
    timingsMs: {
      journeyPreparation: multimodal.submittedAt - startedAt,
      conversationSettlement: settledAt - multimodal.submittedAt,
      rendererPostSettlement: completedAt - settledAt,
    },
  };
}
