// @vitest-environment happy-dom

import { act, createElement, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopServerProfile, SaveDesktopServerProfileInput } from "../src/server/profile.js";
import { ConnectionsDialog } from "../src/renderer/server/connections.js";

let root: Root | undefined;
type Props = ComponentProps<typeof ConnectionsDialog>;

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Connections dialog", () => {
  it("creates a server through the product-owned form and publishes the refreshed list", async () => {
    let profiles: readonly DesktopServerProfile[] = [];
    const saveProfile = vi.fn(async () => {
      profiles = [profile];
      return profile;
    });
    const onProfilesChanged = vi.fn();
    await mount({
      profiles,
      saveProfile,
      listProfiles: async () => profiles,
      onProfilesChanged,
    });

    await click('[data-ui-server-profile-action="add"]');
    await input('[data-ui-server-profile-field="profile-id"]', profile.profileId);
    await input('[data-ui-server-profile-field="name"]', profile.name);
    await input('[data-ui-server-profile-field="server-url"]', profile.serverUrl);
    await input('[data-ui-server-profile-field="credential"]', "secret-value");
    await act(async () => required<HTMLFormElement>("[data-ui-server-profile-form]").requestSubmit());

    expect(saveProfile).toHaveBeenCalledWith({
      profileId: profile.profileId,
      name: profile.name,
      serverUrl: profile.serverUrl,
      credential: "secret-value",
    });
    expect(onProfilesChanged).toHaveBeenCalledWith([profile]);
    expect(document.querySelector("[data-ui-server-profile-form]")).toBeNull();
    expect(document.body.textContent).not.toContain("secret-value");
  });

  it("requires visible confirmation before removing the selected server", async () => {
    let profiles: readonly DesktopServerProfile[] = [profile];
    const removeProfile = vi.fn(async () => { profiles = []; });
    const onProfilesChanged = vi.fn();
    await mount({
      profiles,
      removeProfile,
      listProfiles: async () => profiles,
      onProfilesChanged,
    });

    await click('[data-ui-server-profile-action="remove"]');
    expect(removeProfile).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui-server-profile-action="confirm-remove"]')).not.toBeNull();
    await click('[data-ui-server-profile-action="confirm-remove"]');

    expect(removeProfile).toHaveBeenCalledWith(profile.profileId);
    expect(onProfilesChanged).toHaveBeenCalledWith([]);
  });

  it("focuses the safe removal cancellation and returns to its restored trigger", async () => {
    await mount({ profiles: [profile], listProfiles: async () => [profile], onProfilesChanged: vi.fn() });
    await click('[data-ui-server-profile-action="remove"]');
    expect(document.activeElement).toBe(required('[data-ui-server-profile-action="cancel-remove"]'));
    await click('[data-ui-server-profile-action="cancel-remove"]');
    expect(document.activeElement).toBe(required('[data-ui-server-profile-action="remove"]'));
    await click('[data-ui-server-profile-action="add"]');
    expect(document.activeElement).toBe(required('[data-ui-server-profile-field="profile-id"]'));
    await click('[data-ui-server-profile-form] button[type="button"]');
    expect(document.activeElement).toBe(required('[data-ui-server-profile-action="add"]'));
    await click('[data-ui-server-profile-action="edit"]');
    expect(document.activeElement).toBe(required('[data-ui-server-profile-field="name"]'));
  });

  it("synchronously fences duplicate writes and dismissal before React disables controls", async () => {
    const held = deferred<void>();
    const removeProfile = vi.fn(async () => held.promise);
    const onClose = vi.fn();
    await mount({ profiles: [profile], listProfiles: async () => [], removeProfile, onProfilesChanged: vi.fn(), onClose });
    await click('[data-ui-server-profile-action="remove"]');
    const confirm = required<HTMLButtonElement>('[data-ui-server-profile-action="confirm-remove"]');
    const cancel = required<HTMLButtonElement>('[data-ui-server-profile-action="cancel-remove"]');
    const close = required<HTMLButtonElement>('[aria-label="Close connections"]');
    await act(async () => { confirm.focus(); confirm.click(); confirm.click(); cancel.click(); close.click(); });
    expect(removeProfile).toHaveBeenCalledTimes(1);
    expect(confirm.isConnected).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(required('[data-ui-connections-dialog]'));
    expect(required('[data-ui-connections-dialog]').getAttribute("aria-busy")).toBe("true");
    const outside = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    await act(async () => required('.connection-backdrop').dispatchEvent(outside));
    expect(outside.defaultPrevented).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => held.resolve());
    expect(document.activeElement).toBe(required('[data-ui-server-profile-action="add"]'));
  });

  it("uses Escape for the inner edit or removal section before dismissing the modal", async () => {
    const onClose = vi.fn();
    await mount({ profiles: [profile], listProfiles: async () => [profile], onProfilesChanged: vi.fn(), onClose });
    await click('[data-ui-server-profile-action="add"]');
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector('[data-ui-server-profile-form]')).toBeNull();
    expect(document.activeElement).toBe(required('[data-ui-server-profile-action="add"]'));
    expect(onClose).not.toHaveBeenCalled();
    await click('[data-ui-server-profile-action="remove"]');
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector('[data-ui-server-profile-action="confirm-remove"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["write", "readback"])("keeps a %s failure explicit without automatically repeating the write", async (stage) => {
    const removeProfile = vi.fn(async () => { if (stage === "write") throw new Error("Write failed"); });
    const listProfiles = vi.fn(async () => { throw new Error("Readback failed"); });
    const onProfilesChanged = vi.fn();
    await mount({ profiles: [profile], listProfiles, removeProfile, onProfilesChanged });
    await click('[data-ui-server-profile-action="remove"]');
    const confirm = required<HTMLButtonElement>('[data-ui-server-profile-action="confirm-remove"]');
    confirm.focus();
    await click('[data-ui-server-profile-action="confirm-remove"]');
    expect(required('[role="alert"]').textContent).toContain(stage === "write" ? "Write failed" : "Readback failed");
    expect(removeProfile).toHaveBeenCalledTimes(1);
    expect(listProfiles).toHaveBeenCalledTimes(stage === "write" ? 0 : 1);
    expect(onProfilesChanged).not.toHaveBeenCalled();
    expect(confirm.disabled).toBe(stage === "readback");
    expect(document.activeElement).toBe(stage === "write" ? confirm : required('[role="alert"] button'));
  });

  it("retries only list readback after a successful write and does not resend the mutation", async () => {
    const removeProfile = vi.fn(async () => {});
    const listProfiles = vi.fn<() => Promise<readonly DesktopServerProfile[]>>()
      .mockRejectedValueOnce(new Error("Readback failed"))
      .mockResolvedValueOnce([]);
    const onProfilesChanged = vi.fn();
    await mount({ profiles: [profile], listProfiles, removeProfile, onProfilesChanged });
    await click('[data-ui-server-profile-action="remove"]');
    await click('[data-ui-server-profile-action="confirm-remove"]');
    expect(required('[role="alert"]').textContent).toContain("Server updated");
    await click('[role="alert"] button');
    expect(removeProfile).toHaveBeenCalledTimes(1);
    expect(listProfiles).toHaveBeenCalledTimes(2);
    expect(onProfilesChanged).toHaveBeenCalledExactlyOnceWith([]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it.each(["unmount", "client"])("ignores a write completion after %s without starting stale readback", async (lifetime) => {
    const held = deferred<void>();
    const listProfiles = vi.fn(async () => []);
    const onProfilesChanged = vi.fn();
    const props = await mount({ profiles: [profile], listProfiles, removeProfile: async () => held.promise, onProfilesChanged });
    await click('[data-ui-server-profile-action="remove"]');
    await click('[data-ui-server-profile-action="confirm-remove"]');
    if (lifetime === "unmount") await unmount();
    else await render({ ...props, client: { ...props.client, listProfiles: async () => [profile] } });
    await act(async () => held.resolve());
    expect(listProfiles).not.toHaveBeenCalled();
    expect(onProfilesChanged).not.toHaveBeenCalled();
    if (lifetime === "client") expect(required<HTMLButtonElement>('[data-ui-server-profile-action="add"]').disabled).toBe(false);
  });

  it.each(["unmount", "client"])("ignores readback completion after %s", async (lifetime) => {
    const held = deferred<readonly DesktopServerProfile[]>();
    const onProfilesChanged = vi.fn();
    const props = await mount({ profiles: [profile], listProfiles: async () => held.promise, onProfilesChanged });
    await click('[data-ui-server-profile-action="remove"]');
    await click('[data-ui-server-profile-action="confirm-remove"]');
    if (lifetime === "unmount") await unmount();
    else await render({ ...props, client: { ...props.client, listProfiles: async () => [profile] } });
    await act(async () => held.resolve([]));
    expect(onProfilesChanged).not.toHaveBeenCalled();
  });

  it("does not publish an obsolete error into the replacement client", async () => {
    const held = deferred<void>();
    const props = await mount({ profiles: [profile], listProfiles: async () => [], removeProfile: async () => held.promise, onProfilesChanged: vi.fn() });
    await click('[data-ui-server-profile-action="remove"]');
    await click('[data-ui-server-profile-action="confirm-remove"]');
    await render({ ...props, client: { ...props.client } });
    await act(async () => held.reject(new Error("Obsolete failure")));
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

async function mount(overrides: {
  readonly profiles: readonly DesktopServerProfile[];
  readonly listProfiles: () => Promise<readonly DesktopServerProfile[]>;
  readonly saveProfile?: (input: SaveDesktopServerProfileInput) => Promise<DesktopServerProfile>;
  readonly removeProfile?: (profileId: string) => Promise<void>;
  readonly onProfilesChanged: (profiles: readonly DesktopServerProfile[]) => void;
  readonly onClose?: () => void;
}): Promise<Props> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props: Props = {
      client: {
        listProfiles: overrides.listProfiles,
        saveProfile: overrides.saveProfile ?? (async () => profile),
        removeProfile: overrides.removeProfile ?? (async () => {}),
      },
      profiles: overrides.profiles,
      loading: false,
      loadError: undefined,
      onProfilesChanged: overrides.onProfilesChanged,
      onClose: overrides.onClose ?? (() => {}),
  };
  await render(props);
  return props;
}

async function render(props: Props): Promise<void> {
  await act(async () => root?.render(createElement(StrictMode, null, createElement(ConnectionsDialog, props))));
}

async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  root = undefined;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function click(selector: string): Promise<void> {
  await act(async () => required<HTMLButtonElement>(selector).click());
}

async function input(selector: string, value: string): Promise<void> {
  const control = required<HTMLInputElement>(selector);
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function required<T extends Element>(selector: string): T {
  const value = document.querySelector(selector);
  if (value === null) throw new Error(`missing test element: ${selector}`);
  return value as T;
}

const profile: DesktopServerProfile = {
  profileId: "office",
  name: "Office",
  serverUrl: "https://office.example/",
  credentialConfigured: true,
  createdAt: 1,
  updatedAt: 1,
};
