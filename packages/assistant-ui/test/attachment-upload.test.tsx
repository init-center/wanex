// @vitest-environment happy-dom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CONVERSATION_ATTACHMENT_BYTES } from "@wanex/assistant/attachments";
import type { Snapshot } from "../src/application/model.js";
import type { AttachmentUploadResult, Client } from "../src/client/contracts.js";
import { useAttachmentUpload } from "../src/ui/composer/use-attachment-upload.js";

type Options = Parameters<typeof useAttachmentUpload>[0];
type Upload = NonNullable<Client["uploadAttachment"]>;
let root: Root | undefined;
let latest: ReturnType<typeof useAttachmentUpload> | undefined;
// The operation only forwards this opaque snapshot; App integration tests prove
// canonical snapshot rendering and text/attachment draft retention separately.
const snapshot = { kind: "web.snapshot", generatedAt: 1 } as Snapshot;

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  latest = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("attachment upload ownership", () => {
  it.each(["session", "client", "permission", "unmount"])(
    "does not start a Host write after %s changes during file reading",
    async (change) => {
      const bytes = deferred<ArrayBuffer>();
      const file = image();
      vi.spyOn(file, "arrayBuffer").mockReturnValue(bytes.promise);
      const upload = vi.fn<Upload>().mockResolvedValue(result());
      const options = await mount(upload);
      const stale = current();
      let running!: Promise<void>;
      await act(async () => { running = stale.uploadFiles([file]); });
      expect(stale.isUploading()).toBe(true);
      if (change === "unmount") {
        await act(async () => root?.unmount());
        root = undefined;
      } else {
        await render({ ...options,
          ...(change === "session" ? { sessionId: "session-2" } : {}),
          ...(change === "client" ? { client: client(upload) } : {}),
          ...(change === "permission" ? { canUpload: false } : {}),
        });
      }
      options.onError.mockClear();
      await act(async () => { bytes.resolve(new Uint8Array([1]).buffer); await running; });
      expect(upload).not.toHaveBeenCalled();
      expect(options.onSnapshot).not.toHaveBeenCalled();
      expect(options.onError).not.toHaveBeenCalled();
      const another = image();
      const read = vi.spyOn(another, "arrayBuffer");
      await act(async () => stale.uploadFiles([another]));
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["session", "resolve"], ["session", "reject"],
    ["client", "resolve"], ["client", "reject"],
    ["permission", "resolve"], ["permission", "reject"],
    ["unmount", "resolve"], ["unmount", "reject"],
  ])(
    "ignores an old Host response after %s changes (%s) and stops the batch",
    async (change, outcome) => {
      const pending = deferred<AttachmentUploadResult>();
      const upload = vi.fn<Upload>().mockReturnValue(pending.promise);
      const options = await mount(upload);
      const nextFile = image("next.png");
      const readNext = vi.spyOn(nextFile, "arrayBuffer");
      let running!: Promise<void>;
      await act(async () => { running = current().uploadFiles([image(), nextFile]); });
      expect(upload).toHaveBeenCalledTimes(1);
      if (change === "unmount") {
        await act(async () => root?.unmount());
        root = undefined;
      } else {
        await render({ ...options,
          ...(change === "session" ? { sessionId: "session-2" } : {}),
          ...(change === "client" ? { client: client(upload) } : {}),
          ...(change === "permission" ? { canUpload: false } : {}),
        });
      }
      options.onError.mockClear();
      await act(async () => {
        if (outcome === "resolve") pending.resolve(result());
        else pending.reject(new Error("Old Host failure"));
        await running;
      });
      expect(options.onSnapshot).not.toHaveBeenCalled();
      expect(options.onError).not.toHaveBeenCalled();
      expect(readNext).not.toHaveBeenCalled();
      expect(upload).toHaveBeenCalledTimes(1);
      if (change !== "unmount") expect(current().uploading).toBe(false);
    },
  );

  it("keeps a new Session upload busy when the old Session write settles", async () => {
    const old = deferred<AttachmentUploadResult>();
    const next = deferred<AttachmentUploadResult>();
    const upload = vi.fn<Upload>().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const options = await mount(upload);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = current().uploadFiles([image()]); });
    await render({ ...options, sessionId: "session-2" });
    await act(async () => { second = current().uploadFiles([image("new.png")]); });
    await act(async () => { old.resolve(result()); await first; });
    expect(current().uploading).toBe(true);
    expect(current().isUploading()).toBe(true);
    expect(options.onSnapshot).not.toHaveBeenCalled();
    await act(async () => current().uploadFiles([image("duplicate.png")]));
    expect(upload).toHaveBeenCalledTimes(2);
    const settled = result();
    await act(async () => { next.resolve(settled); await second; });
    expect(current().uploading).toBe(false);
    expect(options.onSnapshot).toHaveBeenCalledExactlyOnceWith(settled.snapshot, 2);
    expect(upload.mock.calls.map(([request]) => request.sessionId)).toEqual(["session-1", "session-2"]);
  });

  it("publishes each success and stops on partial failure without replaying writes", async () => {
    const upload = vi.fn<Upload>().mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error("Second file rejected"));
    const options = await mount(upload);
    const third = image("third.png");
    const read = vi.spyOn(third, "arrayBuffer");
    await act(async () => current().uploadFiles([image(), image("second.png"), third]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(options.onSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot, 1);
    expect(options.onError.mock.calls).toEqual([[undefined], ["Second file rejected"]]);
    expect(read).not.toHaveBeenCalled();
    expect(current().uploading).toBe(false);
  });

  it("rejects an oversized file before reading bytes or sending a Host request", async () => {
    const upload = vi.fn<Upload>().mockResolvedValue(result());
    const options = await mount(upload);
    const file = image();
    Object.defineProperty(file, "size", { value: MAX_CONVERSATION_ATTACHMENT_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await act(async () => current().uploadFiles([file]));
    expect(read).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenLastCalledWith(`Attachment exceeds ${MAX_CONVERSATION_ATTACHMENT_BYTES} bytes`);
    expect(current().isUploading()).toBe(false);
  });

  it("keeps an active upload across unrelated renders of the same target", async () => {
    const pending = deferred<AttachmentUploadResult>();
    const upload = vi.fn<Upload>().mockReturnValue(pending.promise);
    const options = await mount(upload);
    let running!: Promise<void>;
    await act(async () => { running = current().uploadFiles([image()]); });
    await render({ ...options, unavailableMessage: "Updated model help" });
    await act(async () => { pending.resolve(result()); await running; });
    expect(options.onSnapshot).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
    expect(current().uploading).toBe(false);
  });

  it("supports the unbound draft and preserves the MIME fallback", async () => {
    const upload = vi.fn<Upload>().mockResolvedValue(result());
    const options = await mount(upload);
    const { sessionId: _sessionId, ...unbound } = options;
    await render(unbound);
    await act(async () => current().uploadFiles([new File([new Uint8Array([1])], "notes.bin")]));
    expect(upload).toHaveBeenCalledExactlyOnceWith({ content: new Uint8Array([1]), label: "notes.bin", mediaType: "application/octet-stream" });
  });

  it("does not read files when the Host has no upload capability", async () => {
    const options = await mount(vi.fn<Upload>());
    const { uploadAttachment: _upload, ...unavailable } = options.client;
    await render({ ...options, client: unavailable });
    const file = image();
    const read = vi.spyOn(file, "arrayBuffer");
    await act(async () => current().uploadFiles([file]));
    expect(read).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledExactlyOnceWith("Attachment upload is unavailable in this host");
  });

  it("ignores an empty selection without clearing errors or sending requests", async () => {
    const upload = vi.fn<Upload>().mockResolvedValue(result());
    const options = await mount(upload);
    await act(async () => current().uploadFiles([]));
    expect(upload).not.toHaveBeenCalled();
    expect(options.onError).not.toHaveBeenCalled();
    expect(options.onSnapshot).not.toHaveBeenCalled();
    expect(current().uploading).toBe(false);
  });

  it("reports a read failure and allows an explicit fresh attempt without automatic retry", async () => {
    const upload = vi.fn<Upload>().mockResolvedValue(result());
    const options = await mount(upload);
    const file = image();
    const read = vi.spyOn(file, "arrayBuffer")
      .mockRejectedValueOnce(new Error("File read failed"))
      .mockResolvedValueOnce(new Uint8Array([1]).buffer);
    await act(async () => current().uploadFiles([file]));
    expect(read).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenLastCalledWith("File read failed");
    expect(current().uploading).toBe(false);
    await act(async () => current().uploadFiles([file]));
    expect(read).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(options.onSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot, 1);
    expect(options.onError).toHaveBeenLastCalledWith(undefined);
  });

  it("does not revive an old write after leaving and returning to its Session", async () => {
    const pending = deferred<AttachmentUploadResult>();
    const upload = vi.fn<Upload>().mockReturnValue(pending.promise);
    const options = await mount(upload);
    let running!: Promise<void>;
    await act(async () => { running = current().uploadFiles([image()]); });
    await render({ ...options, sessionId: "session-2" });
    await render(options);
    await act(async () => { pending.resolve(result()); await running; });
    expect(options.onSnapshot).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(current().uploading).toBe(false);
  });
});

function Fixture(options: Options) {
  latest = useAttachmentUpload(options);
  return <output data-uploading={latest.uploading} />;
}
function current(): ReturnType<typeof useAttachmentUpload> {
  if (latest === undefined) throw new Error("Upload fixture is not mounted");
  return latest;
}
async function render(options: Options): Promise<void> {
  await act(async () => root!.render(<StrictMode><Fixture {...options} /></StrictMode>));
}
async function mount(upload: Upload) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let generation = 0;
  const options = {
    client: client(upload), sessionId: "session-1", canUpload: true,
    unavailableMessage: "Model does not support attachments",
    beginRequest: () => ++generation,
    onSnapshot: vi.fn<Options["onSnapshot"]>(),
    onError: vi.fn<Options["onError"]>(),
  };
  await render(options);
  return options;
}
function client(upload: Upload): Client {
  return {
    uploadAttachment: upload,
    readSnapshot: async () => snapshot,
    dispatchAction: async () => { throw new Error("Unexpected action"); },
  };
}
function image(name = "diagram.png"): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}
function result(): AttachmentUploadResult {
  const attachment: AttachmentUploadResult["attachment"] = {
    kind: "assistant.attachment", resourceId: "resource-1", resourceKind: "image",
    previewKind: "image", state: "available", sizeBytes: 1, sha256: "a".repeat(64),
    label: "diagram.png", mediaType: "image/png", addedAt: 1,
  };
  return {
    kind: "web.attachment-uploaded", attachment, snapshot,
    attachments: { kind: "assistant.conversation-attachments", draftKey: "session-1", sessionId: "session-1", attachments: [attachment] },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
