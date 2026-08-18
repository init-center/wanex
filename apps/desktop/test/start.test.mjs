import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalProductDesktopStartArgs,
  createProductDesktopStartPlan,
} from "../scripts/start.mjs";

describe("Product Desktop direct development start", () => {
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
      WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS: '["/forbidden-extension"]',
    };

    const plan = createProductDesktopStartPlan({
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
          "product-desktop",
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
          "product-desktop",
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
      "WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS",
    );
    expect(JSON.stringify(plan)).not.toContain("desktop-proof-selected");
    expect(inheritedEnvironment.WANEX_DESKTOP_PROOF_RECEIPT).toBe(
      "forbidden-receipt.json",
    );
  });

  it("rejects arguments instead of creating a second launch mode", () => {
    expect(assertCanonicalProductDesktopStartArgs([])).toBeUndefined();
    expect(assertCanonicalProductDesktopStartArgs(["--"])).toBeUndefined();
    expect(() =>
      assertCanonicalProductDesktopStartArgs(["--proof"]),
    ).toThrow("unknown Product Desktop start argument: --proof");
  });
});
