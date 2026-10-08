import { useLayoutEffect, useMemo, useState } from "react";
import { MAX_CONVERSATION_ATTACHMENT_BYTES } from "@wanex/assistant/attachments";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";

interface UploadScope {
  active: boolean;
  operation: object | undefined;
}

export function useAttachmentUpload({
  client,
  sessionId,
  canUpload,
  unavailableMessage,
  beginRequest,
  onSnapshot,
  onError,
}: {
  readonly client: Client;
  readonly sessionId?: string;
  readonly canUpload: boolean;
  readonly unavailableMessage: string;
  readonly beginRequest: () => number;
  readonly onSnapshot: (snapshot: Snapshot, generation: number) => void;
  readonly onError: (message: string | undefined) => void;
}): {
  readonly uploading: boolean;
  readonly isUploading: () => boolean;
  readonly uploadFiles: (files: readonly File[]) => Promise<void>;
} {
  const scope = useMemo<UploadScope>(() => ({
    active: false,
    operation: undefined,
  }), [canUpload, client, sessionId]);
  const [busyScope, setBusyScope] = useState<UploadScope>();

  useLayoutEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
      scope.operation = undefined;
    };
  }, [scope]);

  const isUploading = (): boolean => scope.active && scope.operation !== undefined;

  async function uploadFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0 || !scope.active || isUploading()) return;
    if (!canUpload) {
      onError(unavailableMessage);
      return;
    }
    const upload = client.uploadAttachment;
    if (upload === undefined) {
      onError("Attachment upload is unavailable in this host");
      return;
    }
    const operation = {};
    scope.operation = operation;
    setBusyScope(scope);
    onError(undefined);
    const isCurrent = (): boolean => scope.active && scope.operation === operation;
    try {
      for (const file of files) {
        if (!isCurrent()) return;
        if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
          throw new Error(`Attachment exceeds ${MAX_CONVERSATION_ATTACHMENT_BYTES} bytes`);
        }
        const content = new Uint8Array(await file.arrayBuffer());
        // File reads and Host writes are separate awaits: never start the write
        // after its view/target has gone away, or publish a completed old write.
        if (!isCurrent()) return;
        const generation = beginRequest();
        const result = await upload.call(client, {
          content,
          mediaType: file.type.length === 0 ? "application/octet-stream" : file.type,
          label: file.name,
          ...(sessionId === undefined ? {} : { sessionId }),
        });
        if (!isCurrent()) return;
        onSnapshot(result.snapshot, generation);
      }
    } catch (reason) {
      if (isCurrent()) {
        onError(reason instanceof Error ? reason.message : "Attachment upload failed");
      }
    } finally {
      if (isCurrent()) {
        scope.operation = undefined;
        setBusyScope((current) => current === scope ? undefined : current);
      }
    }
  }

  return { uploading: busyScope === scope && isUploading(), isUploading, uploadFiles };
}
