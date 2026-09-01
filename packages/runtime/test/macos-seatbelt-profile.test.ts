import { describe, expect, it } from "vitest"
import {
  pathDirectoriesFromEnvironment,
  projectMacosSeatbeltProfile
} from "../src/execution/macos/profile.js"
import type { ExecutionPolicySnapshot } from "@wanex/protocol"

describe("macOS Seatbelt profile projection", () => {
  it("projects canonical roots and keeps each filesystem effect explicit", () => {
    const result = projectMacosSeatbeltProfile({
      policy: policy({
        roots: [
          { id: "zeta", effects: ["remove", "create"] },
          { id: "alpha", effects: ["read", "write"] }
        ]
      }),
      roots: [
        { id: "zeta", path: "/private/var/folders/wanex-zeta" },
        { id: "alpha", path: "/private/var/folders/wanex-alpha" }
      ],
      cwd: "/private/var/folders/wanex-alpha",
      program: "/bin/sh",
      args: ["-c", "printf '%s' \"$0\""],
      pathDirectories: ["/usr/bin", "/usr/bin"]
    })

    expect(result.definitions).toEqual([
      { name: "WORKING_DIRECTORY", path: "/private/var/folders/wanex-alpha" },
      { name: "READ_ROOT_0", path: "/private/var/folders/wanex-alpha" },
      { name: "WRITE_ROOT_0", path: "/private/var/folders/wanex-alpha" },
      { name: "MUTABLE_ROOT_0", path: "/private/var/folders/wanex-alpha" },
      { name: "CREATE_ROOT_1", path: "/private/var/folders/wanex-zeta" },
      { name: "REMOVE_ROOT_1", path: "/private/var/folders/wanex-zeta" },
      { name: "MUTABLE_ROOT_1", path: "/private/var/folders/wanex-zeta" },
      { name: "EXECUTABLE", path: "/bin/sh" },
      { name: "PATH_0", path: "/usr/bin" }
    ])
    expect(result.profile).toContain(
      "(allow file-read* file-test-existence\n  (subpath (param \"READ_ROOT_0\")))",
    )
    expect(result.profile).toContain(
      "(allow file-write-data\n  (subpath (param \"WRITE_ROOT_0\")))",
    )
    expect(result.profile).toContain(
      "(allow file-write-create\n  (subpath (param \"CREATE_ROOT_1\")))",
    )
    expect(result.profile).toContain(
      "(allow file-write-unlink\n  (subpath (param \"REMOVE_ROOT_1\")))",
    )
    expect(result.profile).toContain(
      "(deny file-write-unlink (require-all (literal (param \"MUTABLE_ROOT_1\")) (vnode-type DIRECTORY)))",
    )
    expect(result.profile).not.toContain('(allow network-outbound)\n(allow network-inbound)')
    expect(result.profile).not.toContain('(allow file-write* (subpath "/tmp"))')
  })

  it("adds unrestricted network only when policy requests it", () => {
    const result = projectMacosSeatbeltProfile({
      policy: policy({ network: "unrestricted" }),
      roots: [{ id: "workspace", path: "/private/var/folders/wanex" }],
      cwd: "/private/var/folders/wanex",
      program: "sh",
      args: [],
      pathDirectories: ["/bin"]
    })

    expect(result.profile).toContain("(allow network-outbound)\n(allow network-inbound)")
    expect(result.command.at(-2)).toBe("--")
    expect(result.command.at(-1)).toBe("sh")
  })

  it("allows both Homebrew installation prefixes used by macOS targets", () => {
    const result = projectMacosSeatbeltProfile({
      policy: policy(),
      roots: [{ id: "workspace", path: "/workspace" }],
      cwd: "/workspace",
      program: "/usr/local/Cellar/git/2.55.0/bin/git",
      args: ["rev-parse", "--show-toplevel"],
      pathDirectories: ["/usr/local/bin"]
    })

    expect(result.profile).toContain('(subpath "/opt/homebrew/Cellar")')
    expect(result.profile).toContain('(subpath "/opt/homebrew/opt")')
    expect(result.profile).toContain('(subpath "/usr/local/Cellar")')
    expect(result.profile).toContain('(subpath "/usr/local/opt")')
    expect(result.profile).toContain('(subpath "/usr/local/lib")')
  })

  it("resolves empty and relative PATH entries against the admitted cwd", () => {
    expect(pathDirectoriesFromEnvironment("/usr/bin::tools", "/workspace")).toEqual([
      "/usr/bin",
      "/workspace",
      "/workspace/tools"
    ])
  })

  it("rejects relative or control-character paths before producing a profile", () => {
    expect(() =>
      projectMacosSeatbeltProfile({
        policy: policy(),
        roots: [{ id: "workspace", path: "workspace" }],
        cwd: "/workspace",
        program: "sh",
        args: [],
        pathDirectories: []
      }),
    ).toThrow("Seatbelt filesystem root workspace must be an absolute path")

    expect(() =>
      projectMacosSeatbeltProfile({
        policy: policy(),
        roots: [{ id: "workspace", path: "/workspace" }],
        cwd: "/workspace\nmalicious",
        program: "sh",
        args: [],
        pathDirectories: []
      }),
    ).toThrow("Seatbelt working directory must be an absolute path")
  })
})

function policy(
  overrides: {
    readonly roots?: ExecutionPolicySnapshot["filesystem"]["roots"]
    readonly network?: ExecutionPolicySnapshot["network"]
  } = {},
): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: overrides.roots ?? [{ id: "workspace", effects: ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 100
    },
    process: {
      oneShot: true,
      managed: true,
      cleanup: "durable_supervisor",
      environmentVariables: []
    },
    network: overrides.network ?? "denied",
    isolation: "os",
    pty: false
  }
}
