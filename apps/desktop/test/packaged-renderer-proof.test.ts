import { describe, expect, it } from "vitest";
import type { BrowserWindow } from "electron";
import {
  runWanexDesktopPackagedRendererProof,
} from "../src/packaged-renderer-proof.js";
import type {
  WanexDesktopRemoteMediaRendererEvidence,
} from "../src/remote-media-proof.js";

describe("Desktop packaged Renderer proof boundary", () => {
  it("probes every distinct strict capability and removes URLs from retained evidence", async () => {
    const capabilityUrl = `wanex-resource://delivery/wrc_${"a".repeat(43)}`;
    const secondCapabilityUrl = `wanex-resource://delivery/wrc_${"b".repeat(43)}`;
    const probed: string[] = [];
    const result = await runWanexDesktopPackagedRendererProof({
      window: proofWindow(remoteMediaEvidence([
        capabilityUrl,
        capabilityUrl,
        secondCapabilityUrl,
      ])),
      step: "relaunch-remote-media",
      remoteProfileId: "office",
      async probeResourceCapability(url) {
        probed.push(url);
        return 410;
      },
    });

    expect(probed).toEqual([capabilityUrl, secondCapabilityUrl]);
    expect(result).toMatchObject({
      ok: true,
      step: "relaunch-remote-media",
      capabilityRetired: true,
    });
    expect(result).not.toHaveProperty("retiredCapabilityUrls");
    expect(JSON.stringify(result)).not.toContain("wrc_");
  });

  it("accepts the restore contract only after every recovered capability retires", async () => {
    const urls = [
      `wanex-resource://delivery/wrc_${"c".repeat(43)}`,
      `wanex-resource://delivery/wrc_${"d".repeat(43)}`,
    ];
    const result = await runWanexDesktopPackagedRendererProof({
      window: proofWindow(remoteMediaRestoreEvidence(urls)),
      step: "relaunch-remote-media-restore",
      remoteProfileId: "office",
      async probeResourceCapability(url) {
        return url === urls[0] ? 404 : 410;
      },
    });
    expect(result).toMatchObject({
      ok: true,
      step: "relaunch-remote-media-restore",
      capabilityRetired: true,
    });
    expect(JSON.stringify(result)).not.toContain("wrc_");
  });

  it("fails the proof when any capability remains active", async () => {
    const urls = [
      `wanex-resource://delivery/wrc_${"e".repeat(43)}`,
      `wanex-resource://delivery/wrc_${"f".repeat(43)}`,
    ];
    const result = await runWanexDesktopPackagedRendererProof({
      window: proofWindow(remoteMediaEvidence(urls)),
      step: "relaunch-remote-media",
      remoteProfileId: "office",
      async probeResourceCapability(url) {
        return url === urls[0] ? 410 : 200;
      },
    });
    expect(result).toMatchObject({ ok: false, capabilityRetired: false });
  });

  it("rejects non-local capability evidence before invoking the probe", async () => {
    let called = false;
    await expect(runWanexDesktopPackagedRendererProof({
      window: proofWindow(remoteMediaEvidence([
        "https://attacker.invalid/resource",
      ])),
      step: "relaunch-remote-media",
      remoteProfileId: "office",
      async probeResourceCapability() {
        called = true;
        return 404;
      },
    })).rejects.toThrow("Resource capability URL is invalid");
    expect(called).toBe(false);
  });
});

function proofWindow(
  evidence: WanexDesktopRemoteMediaRendererEvidence,
): BrowserWindow {
  return {
    webContents: {
      async executeJavaScript() {
        return evidence;
      },
    },
  } as unknown as BrowserWindow;
}

function remoteMediaEvidence(
  retiredCapabilityUrls: readonly string[],
): WanexDesktopRemoteMediaRendererEvidence {
  return {
    step: "relaunch-remote-media",
    providerEvidenceRedacted: true,
    profileRestored: true,
    remoteLocationSelected: true,
    remoteModelReady: true,
    sessionId: "session-remote-media",
    attachmentPickerVisible: true,
    unsupportedAttachmentRejected: true,
    unsupportedDraftPreserved: true,
    attachmentPreviewVisible: true,
    attachmentCapabilityUrlLocal: true,
    multimodalConversationSubmitted: true,
    multimodalResponseVisible: true,
    uploadedResourceVisible: true,
    imageGenerationToolSucceeded: true,
    generatedResourceVisible: true,
    generatedResourceEvidenceValid: true,
    generatedPreviewVisible: true,
    staleUploadRejected: true,
    staleUploadAbsent: true,
    remoteEvidenceHidden: true,
    retiredCapabilityUrls,
    timingsMs: {
      journeyPreparation: 1,
      conversationSettlement: 2,
      rendererPostSettlement: 3,
    },
  };
}

function remoteMediaRestoreEvidence(
  retiredCapabilityUrls: readonly string[],
): WanexDesktopRemoteMediaRendererEvidence {
  return {
    step: "relaunch-remote-media-restore",
    providerEvidenceRedacted: true,
    profileRestored: true,
    remoteLocationSelected: true,
    remoteModelReady: true,
    sessionId: "session-remote-media",
    uploadedTranscriptRestored: true,
    uploadedResourceRestored: true,
    uploadedPreviewRestored: true,
    generatedTranscriptRestored: true,
    generatedResourceRestored: true,
    generatedPreviewRestored: true,
    attachmentDraftEmpty: true,
    remoteEvidenceHidden: true,
    retiredCapabilityUrls,
    timingsMs: {
      journeyPreparation: 1,
      conversationSettlement: 0,
      rendererPostSettlement: 0,
    },
  };
}
