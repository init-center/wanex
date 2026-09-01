import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalDesktopStartArgs,
  createDesktopStartPlan,
  startDesktop,
} from "../scripts/start.mjs";

describe("Desktop direct development start", () => {
  it.each([
    ["darwin", "wanex-system-service"],
    ["linux", "wanex-system-service"],
    ["win32", "wanex-system-service.exe"],
  ])("builds a normal %s launch plan", (platform, serviceName) => {
    const workspaceRoot = join("", "workspace", "wanex");
    const inheritedEnvironment = {
      KEEP_ME: "retained",
      WANEX_DESKTOP_PROOF_RECEIPT: "forbidden-receipt.json",
      WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT: "forbidden-normal-proof.png",
      WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT: "forbidden-narrow-proof.png",
      WANEX_DESKTOP_PROOF_USER_DATA: "forbidden-profile",
      WANEX_DESKTOP_PROOF_PROFILE_ID: "forbidden-profile-id",
      WANEX_DESKTOP_PROOF_STEP: "relaunch-chat",
      WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL: "http://127.0.0.1:1/v1",
      WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL: "forbidden-credential",
      WANEX_DESKTOP_PROOF_REMOTE_ENDPOINT: "https://127.0.0.1:1/v1/agent-host/message",
      WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL: "forbidden-remote-credential",
      WANEX_DESKTOP_PROOF_REMOTE_PROFILE_ID: "forbidden-remote-profile",
      WANEX_DESKTOP_PROOF_REMOTE_PROFILE_NAME: "forbidden-remote-name",
      WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID: "forbidden-remote-project",
      WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS: '["/forbidden-extension"]',
      WANEX_DESKTOP_PROOF_CODING_PROJECT_SELECTIONS: '["/forbidden-project"]',
    };

    const plan = createDesktopStartPlan({
      workspaceRoot,
      platform,
      electronExecutable: join(workspaceRoot, "tooling", "electron"),
      env: inheritedEnvironment,
    });

    expect(plan.serviceBuild).toEqual({
      name: "System service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"],
    });
    expect(plan.desktop).toMatchObject({
      command: join(workspaceRoot, "tooling", "electron"),
      args: [
        join(
          workspaceRoot,
          "target",
          "distribution",
          "desktop",
          "staging-app",
        ),
      ],
      cwd: workspaceRoot,
      env: {
        KEEP_ME: "retained",
        WANEX_SYSTEM_SERVICE_BIN: join(
          workspaceRoot,
          "target",
          "debug",
          serviceName,
        ),
        WANEX_DESKTOP_CREDENTIAL_DIR: join(
          workspaceRoot,
          "target",
          "distribution",
          "desktop",
          "credentials",
        ),
      },
    });
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_RECEIPT",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_USER_DATA",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_PROFILE_ID",
    );
    expect(plan.desktop.env).not.toHaveProperty("WANEX_DESKTOP_PROOF_STEP");
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_REMOTE_ENDPOINT",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_REMOTE_PROFILE_ID",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_REMOTE_PROFILE_NAME",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS",
    );
    expect(plan.desktop.env).not.toHaveProperty(
      "WANEX_DESKTOP_PROOF_CODING_PROJECT_SELECTIONS",
    );
    expect(JSON.stringify(plan)).not.toContain("desktop-proof-selected");
    expect(inheritedEnvironment.WANEX_DESKTOP_PROOF_RECEIPT).toBe(
      "forbidden-receipt.json",
    );
  });

  it("rejects arguments instead of creating a second launch mode", () => {
    expect(assertCanonicalDesktopStartArgs([])).toBeUndefined();
    expect(assertCanonicalDesktopStartArgs(["--"])).toBeUndefined();
    expect(() =>
      assertCanonicalDesktopStartArgs(["--proof"]),
    ).toThrow("unknown Desktop start argument: --proof");
  });

  it("builds prerequisites before launching the normal Desktop", async () => {
    const events = [];

    await startDesktop({
      workspaceRoot: join("", "workspace", "wanex"),
      electronExecutable: join("", "tooling", "electron"),
      env: {},
      runStep: async () => {
        events.push("service");
      },
      buildDesktop: async () => {
        events.push("renderer");
      },
      stageCredentials: async () => {
        events.push("credentials");
      },
      runDesktop: async () => {
        events.push("launch");
      },
    });

    expect(events[0]).toBe("service");
    expect(new Set(events.slice(1, 3))).toEqual(new Set([
      "renderer",
      "credentials",
    ]));
    expect(events[3]).toBe("launch");
  });
});
