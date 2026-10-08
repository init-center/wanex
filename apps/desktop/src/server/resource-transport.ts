import {
  REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH,
  REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER,
} from "@wanex/assistant-host";
import type { DesktopServerProfileCatalog } from "./profile-catalog.js";

export interface DesktopServerResourceBinding {
  readonly profileId: string;
  readonly serverUrl: string;
}

export interface DesktopServerResourceTransport {
  open(request: {
    readonly binding: DesktopServerResourceBinding;
    readonly grant: string;
    readonly method: "GET" | "HEAD";
    readonly range?: string;
    readonly ifNoneMatch?: string;
    readonly signal: AbortSignal;
  }): Promise<Response>;
}

export interface DesktopServerResourceTransportOptions {
  readonly profiles: DesktopServerProfileCatalog;
  readonly fetch?: typeof globalThis.fetch;
}

export function createDesktopServerResourceTransport(
  options: DesktopServerResourceTransportOptions,
): DesktopServerResourceTransport {
  const fetch = options.fetch ?? globalThis.fetch;
  const transport: DesktopServerResourceTransport = {
    async open(request) {
      const profile = await options.profiles.read(request.binding.profileId);
      if (
        profile === null ||
        profile.serverUrl !== request.binding.serverUrl
      ) {
        throw new Error("Server Resource binding is no longer current");
      }
      const secret = await options.profiles.resolveCredential(
        request.binding.profileId,
      );
      if (secret === null) {
        throw new Error("Server Resource credential is unavailable");
      }
      try {
        const headers = new Headers({
          authorization: `Bearer ${secret.reveal()}`,
          [REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER]: request.grant,
        });
        if (request.range !== undefined) headers.set("range", request.range);
        if (request.ifNoneMatch !== undefined) {
          headers.set("if-none-match", request.ifNoneMatch);
        }
        return await fetch(
          new URL(
            REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH,
            request.binding.serverUrl,
          ),
          {
            method: request.method,
            headers,
            signal: request.signal,
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
          },
        );
      } finally {
        secret.dispose();
      }
    },
  };
  return Object.freeze(transport);
}
