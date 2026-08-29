import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadWanexDesktopCredentialBinding,
  parseWanexDesktopCredentialArtifactManifest,
  resolveWanexDesktopCredentialArtifact
} from "../src/credential-artifact.js"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) =>
    rm(dir, { recursive: true, force: true })
  ))
})

describe("Desktop credential artifact", () => {
  it("validates target, size, digest, and binding shape", async () => {
    const dir = await temporaryDirectory()
    const body = Buffer.from("fake-keyring-binding")
    await writeFile(join(dir, "keyring.node"), body)
    const manifest = credentialManifest(body)
    const artifact = await resolveWanexDesktopCredentialArtifact({
      manifest,
      artifactDir: dir,
      platform: "darwin",
      arch: "arm64"
    })
    class Entry {}

    await expect(loadWanexDesktopCredentialBinding({
      artifact,
      load: () => ({ Entry })
    })).resolves.toEqual({ Entry })
    await expect(loadWanexDesktopCredentialBinding({
      artifact,
      load: () => ({})
    })).rejects.toThrow("does not export Entry")
  })

  it("rejects malformed, mismatched, and tampered artifacts", async () => {
    const dir = await temporaryDirectory()
    const body = Buffer.from("fake-keyring-binding")
    await writeFile(join(dir, "keyring.node"), body)
    const manifest = credentialManifest(body)

    expect(() => parseWanexDesktopCredentialArtifactManifest({
      ...manifest,
      extra: true
    })).toThrow("manifest is invalid")
    await expect(resolveWanexDesktopCredentialArtifact({
      manifest,
      artifactDir: dir,
      platform: "darwin",
      arch: "x64"
    })).rejects.toThrow("target mismatch")
    await writeFile(join(dir, "keyring.node"), "tampered")
    await expect(resolveWanexDesktopCredentialArtifact({
      manifest,
      artifactDir: dir,
      platform: "darwin",
      arch: "arm64"
    })).rejects.toThrow(/size mismatch|checksum mismatch/)
  })
})

async function temporaryDirectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-desktop-credential-"))
  tempDirs.push(dir)
  return dir
}

function credentialManifest(body: Buffer) {
  return {
    kind: "wanex.desktop-credential-artifact",
    version: 1,
    target: {
      id: "darwin-arm64",
      platform: "darwin",
      arch: "arm64"
    },
    keyring: {
      kind: "node-api-module",
      path: "keyring.node",
      bytes: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex")
    }
  }
}
