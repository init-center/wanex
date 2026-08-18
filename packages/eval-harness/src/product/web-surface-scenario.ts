import {
  createShell,
  createSurfaceAdapter,
} from "@wanex/product";
import {
  createController,
  handleRequest,
} from "@wanex/web";
import { createHostSurfaceClient } from "@wanex/web/host";
import {
  createLocalAttachmentUploadPort,
  createLocalResourceDeliveryAuthorizer,
  createLocalResourceDeliveryPort,
} from "@wanex/local-host";
import {
  listenWebNodeHost,
  type WebNodeHostServer,
} from "@wanex/local-host/web-host";
import {
  entryByName,
  runJsonAudit,
  type FootprintReport,
} from "../distribution-audit.js";
import { createEvalScenario } from "../runner.js";
import { assert, evalFakeModelEndpoint, isRecord } from "../scenario-utils.js";
import {
  createConversationSettlementFixture,
  productConversationRowText,
} from "./conversation-helpers.js";

export const webSurfaceContractScenario = createEvalScenario({
  id: "product.app-web-surface-contract",
  title: "Web surface consumes typed snapshots through one application shell",
  tags: ["product", "web", "surface", "upper-app", "product-path"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-web-",
    });
    const storeDir = storage.storeDir;
    const app = await createShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-web",
        "eval-web-model",
        "fake",
        { inputModalities: ["text", "image"] },
      ),
    });
    const productSurface = createSurfaceAdapter(app);
    const operations: string[] = [];
    let nodeHost: WebNodeHostServer | undefined;
    try {
      const client = createHostSurfaceClient({
        surface: productSurface,
        observeRequest(request) {
          operations.push(request.operation);
        },
      });
      const webController = await createController({
        client,
        now: () => 12_001,
      });
      nodeHost = await listenWebNodeHost({
        controller: webController,
        surfaceEvents: client,
        attachments: createLocalAttachmentUploadPort(app),
        resourceDeliveries: createLocalResourceDeliveryPort(
          app.trustedResources,
          {
            authorizer: createLocalResourceDeliveryAuthorizer(app),
          },
        ),
      });

      const initial = await handleRequest(webController, {
        kind: "web.request",
        operation: "snapshot",
        requestId: "eval_web_snapshot",
      });
      assert(
        initial.ok &&
          initial.operation === "snapshot" &&
          initial.snapshot.kind === "web.snapshot" &&
          initial.snapshot.view.ready &&
          initial.snapshot.view.mode === "chat" &&
          initial.snapshot.view.commandPaletteCount === 1,
        "initial Web request should return the canonical typed chat snapshot",
      );

      const attachmentBytes = new Uint8Array([137, 80, 78, 71]);
      const uploaded = await postAttachment(
        `${nodeHost.url}/wanex/web/attachment`,
        attachmentBytes,
        "image/png",
        "eval-upload.png",
      );
      assert(
        isSuccessfulAttachmentUpload(uploaded),
        "trusted Host should ingest bounded attachment bytes",
      );
      const preview = await getResourceDelivery(
        `${nodeHost.url}/wanex/web/resource-delivery/prepare`,
        uploaded.upload.attachment.resourceId,
        uploaded.upload.attachment.sha256,
      );
      assert(
        preview.mediaType === "image/png" &&
          preview.sha256 === uploaded.upload.attachment.sha256 &&
          Buffer.from(preview.content).equals(attachmentBytes),
        "trusted Host preview should return exact Resource bytes and evidence",
      );

      const submitted = await handleRequest(webController, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "eval_web_submit",
        action: {
          type: "submit-conversation",
          input: { text: "eval application web conversation" },
        },
      });
      assert(
        submitted.ok &&
          submitted.operation === "dispatchAction" &&
          submitted.actionResult.ok &&
          submitted.actionResult.snapshot.conversation.sessionId !== undefined,
        "Web action should admit a conversation and return its snapshot",
      );
      const sessionId = submitted.ok && submitted.operation === "dispatchAction" &&
        submitted.actionResult.ok
        ? submitted.actionResult.snapshot.conversation.sessionId
        : undefined;
      assert(sessionId !== undefined, "conversation admission should select a session");
      await storage.settlements.waitForNext({ sessionId });

      const selected = await handleRequest(webController, {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "eval_web_select",
        action: { type: "select-session", sessionId },
      });
      assert(
        selected.ok &&
          selected.operation === "dispatchAction" &&
          selected.actionResult.ok &&
          selected.actionResult.snapshot.view.selection?.kind === "session" &&
          selected.actionResult.snapshot.view.selection.sessionId === sessionId,
        "Web should dispatch session selection through the Product client",
      );

      const invalidAction = await handleRequest(webController, {
        kind: "web.request",
        operation: "dispatchAction",
        action: { type: "set-layout", input: { layout: "floating" } },
      });
      assert(
        invalidAction.ok &&
          invalidAction.operation === "dispatchAction" &&
          !invalidAction.actionResult.ok &&
          invalidAction.actionResult.action === "set-layout" &&
          invalidAction.actionResult.snapshot.view.layout === "single",
        "Product Surface should reject invalid typed action payloads",
      );
      const invalidReconciliation = await handleRequest(webController, {
        kind: "web.request",
        operation: "reconcileEvents",
        input: { limit: 0 },
      });
      assert(
        invalidReconciliation.ok === false &&
          invalidReconciliation.error.code === "invalid_request" &&
          invalidReconciliation.error.field === "input.limit",
        "Web should reject invalid reconciliation limits",
      );

      const reconciled = await handleRequest(webController, {
        kind: "web.request",
        operation: "reconcileEvents",
        requestId: "eval_web_reconcile",
        input: { limit: 20 },
      });
      assert(
        reconciled.ok &&
          reconciled.operation === "reconcileEvents" &&
          reconciled.snapshot.conversation.historyRows.some(
            (row) =>
              row.role === "user" &&
              productConversationRowText(row) === "eval application web conversation",
          ),
        "reconciliation should return canonical conversation history",
      );

      const rootHtml = await fetchText(`${nodeHost.url}/`);
      const clientScript = await fetchText(
        `${nodeHost.url}/assets/app.js`,
      );
      const clientStyles = await fetchText(
        `${nodeHost.url}/assets/app.css`,
      );
      const legacyFrameworkRoute = await fetch(`${nodeHost.url}/react`);
      assert(
        rootHtml.includes("data-app-root") &&
          rootHtml.includes("/assets/app.js") &&
          rootHtml.includes("/assets/app.css") &&
          clientScript.includes("data-app-client") &&
          clientStyles.includes(":root") &&
          legacyFrameworkRoute.status === 404 &&
          !rootHtml.includes("data-wanex-web=\"surface\""),
        "Local Host should serve one browser application at the root and no legacy route",
      );

      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"],
      );
      const webFootprint = entryByName(footprint, "@wanex/web");
      const local = entryByName(footprint, "@wanex/local-host");
      const serialized = JSON.stringify([initial, submitted, selected, reconciled, rootHtml]);
      assert(
        !serialized.includes(storeDir) && !serialized.includes(context.serviceBin),
        "Web snapshots and the shell must not leak trusted Host paths",
      );
      assert(
        operations.includes("descriptor") &&
          operations.includes("dispatchSurfaceCommand") &&
          operations.includes("readSurfaceEvents"),
        "Web should use only the Product surface message client",
      );

      return {
        typedSnapshot: true,
        conversationSettled: true,
        attachmentUploaded: true,
        resourcePreviewVerified: true,
        browserRootOnly: true,
        legacyRouteStatus: legacyFrameworkRoute.status,
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
        operations,
        pluginRuntime: webFootprint.contains.pluginRuntime,
        connectorRuntime: webFootprint.contains.connectorRuntime,
        concreteAdapters: webFootprint.contains.concreteAdapters,
        localPluginRuntime: local.contains.pluginRuntime,
        localConnectorRuntime: local.contains.connectorRuntime,
        localConcreteAdapters: local.contains.concreteAdapters,
      };
    } finally {
      await nodeHost?.close();
      await productSurface.dispose();
      await app.dispose();
      await storage.dispose();
    }
  },
});

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  assert(response.status === 200, `GET ${url} should succeed`);
  return await response.text();
}

async function postAttachment(
  url: string,
  content: Uint8Array,
  mediaType: string,
  label: string,
): Promise<unknown> {
  const hostSessionToken = await readHostSessionToken(url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-wanex-host-session": hostSessionToken,
      "x-wanex-media-type": encodeURIComponent(mediaType),
      "x-wanex-attachment-label": encodeURIComponent(label),
    },
    body: content,
  });
  assert(response.status === 201, `POST ${url} should ingest attachment bytes`);
  return await response.json();
}

async function getResourceDelivery(
  url: string,
  resourceId: string,
  sha256: string,
): Promise<{
  readonly content: Uint8Array;
  readonly mediaType: string | null;
  readonly sha256: string | null;
}> {
  const hostSessionToken = await readHostSessionToken(url);
  const hostSessionCookie = await readHostSessionCookie(url);
  const prepared = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken,
    },
    body: JSON.stringify({ resourceId, sha256, purpose: "preview" }),
  });
  assert(prepared.status === 200, `POST ${url} should prepare Resource delivery`);
  const payload = await prepared.json() as {
    readonly delivery?: { readonly url?: string }
  };
  assert(payload.delivery?.url !== undefined, "Resource delivery URL should be present");
  const deliveryUrl = new URL(payload.delivery.url, url);
  const response = await fetch(deliveryUrl, {
    headers: { cookie: hostSessionCookie },
  });
  assert(response.status === 200, `GET ${url} should deliver Resource bytes`);
  const result = {
    content: new Uint8Array(await response.arrayBuffer()),
    mediaType: response.headers.get("content-type"),
    sha256: response.headers.get("x-wanex-resource-sha256"),
  };
  const released = await fetch(deliveryUrl, {
    method: "DELETE",
    headers: {
      cookie: hostSessionCookie,
      "x-wanex-host-session": hostSessionToken,
    },
  });
  assert(released.status === 204, "trusted Renderer should release Resource delivery");
  const afterRelease = await fetch(deliveryUrl, {
    headers: { cookie: hostSessionCookie },
  });
  assert(afterRelease.status === 404, "released Resource delivery should fail closed");
  return result;
}

async function readHostSessionToken(url: string): Promise<string> {
  const html = await fetchText(new URL("/", url).toString());
  const match = /data-host-session-token="([A-Za-z0-9_-]{43})"/.exec(html);
  if (match?.[1] === undefined) {
    throw new Error("application host shell did not include a session token");
  }
  return match[1];
}

async function readHostSessionCookie(url: string): Promise<string> {
  const response = await fetch(new URL("/", url));
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0];
  assert(
    cookie !== undefined && /^wanex_host_session_[a-f0-9]{16}=/.test(cookie),
    "application host shell should set a scoped session cookie",
  );
  return cookie;
}

function isSuccessfulAttachmentUpload(
  value: unknown,
): value is {
  readonly ok: true;
  readonly kind: "web.attachment-upload-response";
  readonly upload: {
    readonly kind: "local-host.attachment-uploaded";
    readonly attachment: {
      readonly resourceId: string;
      readonly resourceKind: "image";
      readonly mediaType: "image/png";
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly label: "eval-upload.png";
    };
  };
} {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.upload)) return false;
  if (
    value.kind !== "web.attachment-upload-response" ||
    value.upload.kind !== "local-host.attachment-uploaded" ||
    !isRecord(value.upload.attachment)
  ) return false;
  return (
    typeof value.upload.attachment.resourceId === "string" &&
    value.upload.attachment.resourceKind === "image" &&
    value.upload.attachment.mediaType === "image/png" &&
    value.upload.attachment.sizeBytes === 4 &&
    typeof value.upload.attachment.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.upload.attachment.sha256) &&
    value.upload.attachment.label === "eval-upload.png"
  );
}
