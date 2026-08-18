import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDesktopExtensionProofComposition,
  createDesktopExtensionProofSelectionQueue,
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

  it("bounds proof-only trusted selections and fails when exhausted", async () => {
    const first = join("", "proof", "extension-v1");
    const second = join("", "proof", "extension-v2");
    const absoluteFirst = join(process.cwd(), first);
    const absoluteSecond = join(process.cwd(), second);
    const select = createDesktopExtensionProofSelectionQueue({
      proofEnabled: true,
      serializedSelections: JSON.stringify([absoluteFirst, absoluteSecond]),
    });
    if (select === undefined) throw new Error("proof selection queue is missing");

    await expect(select()).resolves.toBe(absoluteFirst);
    await expect(select()).resolves.toBe(absoluteSecond);
    await expect(select()).rejects.toThrow("queue is exhausted");
  });

  it("rejects proof selections outside the proof owner", () => {
    expect(() => createDesktopExtensionProofSelectionQueue({
      proofEnabled: false,
      serializedSelections: JSON.stringify([join(process.cwd(), "fixture")]),
    })).toThrow("require proof mode");
    expect(() => createDesktopExtensionProofSelectionQueue({
      proofEnabled: true,
      serializedSelections: JSON.stringify(["relative/fixture"]),
    })).toThrow("must be an absolute path");
    expect(() => createDesktopExtensionProofSelectionQueue({
      proofEnabled: true,
      serializedSelections: "[]",
    })).toThrow("contain 1 to 8 paths");
  });

  it("rejects proof-only host failure composition outside proof mode", () => {
    expect(() => createDesktopExtensionProofComposition({
      proofEnabled: false,
      userDataDir: "/product/user-data",
      selectLocalPackage: async () => undefined,
      failHostCreationOnce: {
        pluginId: "proof.extension",
        version: "2.0.0",
      },
    })).toThrow("requires proof mode");
  });
});
