import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extensionInstallBaseDir,
  selectLocalExtensionDirectory,
} from "../src/extensions.js";

describe("Desktop local extension boundary", () => {
  it("owns the immutable install base under Product user data", () => {
    expect(extensionInstallBaseDir("/product/user-data")).toBe(
      join("/product/user-data", "extensions"),
    );
    expect(() => extensionInstallBaseDir("  ")).toThrow(
      "Desktop user-data directory must not be empty",
    );
  });

  it("returns one native directory directly to the trusted host", async () => {
    await expect(selectLocalExtensionDirectory(async () => ({
      canceled: false,
      filePaths: ["/private/local-extension"],
    }))).resolves.toBe("/private/local-extension");

    await expect(selectLocalExtensionDirectory(async () => ({
      canceled: true,
      filePaths: ["/private/ignored"],
    }))).resolves.toBeUndefined();
    await expect(selectLocalExtensionDirectory(async () => ({
      canceled: false,
      filePaths: [],
    }))).resolves.toBeUndefined();
  });

  it("rejects ambiguous or empty native selections", async () => {
    await expect(selectLocalExtensionDirectory(async () => ({
      canceled: false,
      filePaths: ["/one", "/two"],
    }))).rejects.toThrow("must contain one directory");
    await expect(selectLocalExtensionDirectory(async () => ({
      canceled: false,
      filePaths: ["   "],
    }))).rejects.toThrow("returned an empty directory");
  });
});
