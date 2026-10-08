import { describe, expect, it } from "vitest";
import {
  closeWanexDesktopOwnedResources,
  createWanexDesktopOwnedLifecycle,
  shouldShutdownAfterWindowAllClosed,
} from "../src/lifecycle.js";

describe("desktop lifecycle", () => {
  it("closes the Assistant and Server owners once", async () => {
    const calls: string[] = [];
    const lifecycle = createWanexDesktopOwnedLifecycle(async () => {
      await closeWanexDesktopOwnedResources({
        assistant: async () => { calls.push("assistant"); },
        serverConnections: async () => { calls.push("server"); },
      });
    });

    await Promise.all([lifecycle.close(), lifecycle.close()]);

    expect(lifecycle.state).toBe("closed");
    expect(calls.sort()).toEqual(["assistant", "server"]);
  });

  it("shuts down non-macOS windows when the lifecycle is open", () => {
    expect(shouldShutdownAfterWindowAllClosed("darwin", "open")).toBe(false);
    expect(shouldShutdownAfterWindowAllClosed("win32", "open")).toBe(true);
    expect(shouldShutdownAfterWindowAllClosed("linux", "closed")).toBe(false);
  });
});
