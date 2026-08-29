import { isAbsolute, resolve } from "node:path"
import type {
  ExecutionFileEffect,
  ExecutionPolicySnapshot
} from "@wanex/protocol"
import { normalizeExecutionPolicy } from "../policy.js"
import {
  MACOS_SEATBELT_BASE_POLICY,
  MACOS_SEATBELT_PLATFORM_DEFAULTS
} from "./policies.js"

export const MACOS_SEATBELT_EXECUTABLE = "/usr/bin/sandbox-exec"

export interface MacosSeatbeltProfileRoot {
  readonly id: string
  readonly path: string
}

interface MatchedRoot extends MacosSeatbeltProfileRoot {
  readonly effects: readonly ExecutionFileEffect[]
}

export interface MacosSeatbeltProfileRequest {
  readonly policy: ExecutionPolicySnapshot
  readonly roots: readonly MacosSeatbeltProfileRoot[]
  readonly cwd: string
  readonly program: string
  readonly args: readonly string[]
  readonly pathDirectories: readonly string[]
}

export interface MacosSeatbeltPathDefinition {
  readonly name: string
  readonly path: string
}

export interface MacosSeatbeltProfileProjection {
  readonly profile: string
  readonly definitions: readonly MacosSeatbeltPathDefinition[]
  readonly command: readonly string[]
}

/**
 * Projects an admitted execution policy into a closed-by-default Seatbelt
 * profile. The function has no filesystem or process effects; the supervisor
 * is responsible for passing the returned argv directly to sandbox-exec.
 */
export function projectMacosSeatbeltProfile(
  request: MacosSeatbeltProfileRequest,
): MacosSeatbeltProfileProjection {
  const policy = normalizeExecutionPolicy(request.policy)
  const cwd = absolutePath(request.cwd, "working directory")
  const roots = matchRoots(policy, request.roots)
  const pathDirectories = uniquePaths(
    request.pathDirectories.map((path) => absolutePath(path, "PATH directory")),
  )
  const definitions: MacosSeatbeltPathDefinition[] = [
    { name: "WORKING_DIRECTORY", path: cwd },
  ]
  const readRoots: string[] = []
  const writeRoots: string[] = []
  const createRoots: string[] = []
  const removeRoots: string[] = []
  const mutableRoots: string[] = []

  for (const [index, root] of roots.entries()) {
    const path = absolutePath(root.path, `filesystem root ${root.id}`)
    const effects = new Set(root.effects)
    if (effects.has("read")) {
      const name = `READ_ROOT_${index}`
      definitions.push({ name, path })
      readRoots.push(name)
    }
    if (effects.has("write")) {
      const name = `WRITE_ROOT_${index}`
      definitions.push({ name, path })
      writeRoots.push(name)
    }
    if (effects.has("create")) {
      const name = `CREATE_ROOT_${index}`
      definitions.push({ name, path })
      createRoots.push(name)
    }
    if (effects.has("remove")) {
      const name = `REMOVE_ROOT_${index}`
      definitions.push({ name, path })
      removeRoots.push(name)
    }
    if (
      effects.has("write") ||
      effects.has("create") ||
      effects.has("remove")
    ) {
      const name = `MUTABLE_ROOT_${index}`
      definitions.push({ name, path })
      mutableRoots.push(name)
    }
  }

  const command = [request.program, ...request.args]
  const executable = executablePath(request.program, cwd)
  if (executable !== undefined) {
    definitions.push({ name: "EXECUTABLE", path: executable })
  }
  for (const [index, path] of pathDirectories.entries()) {
    definitions.push({ name: `PATH_${index}`, path })
  }

  const sections = [
    MACOS_SEATBELT_BASE_POLICY,
    MACOS_SEATBELT_PLATFORM_DEFAULTS,
    allowMetadata("WORKING_DIRECTORY"),
    allowPath("file-read* file-test-existence", readRoots),
    allowPath("file-write-data", writeRoots),
    allowPath("file-write-create", createRoots),
    allowPath("file-write-unlink", removeRoots),
    executable === undefined
      ? ""
      : allowPath(
          "file-read* file-test-existence file-map-executable",
          ["EXECUTABLE"],
        ),
    allowPath(
      "file-read-data file-read-metadata file-test-existence file-map-executable",
      pathDirectories.map((_path, index) => `PATH_${index}`),
    ),
    ...mutableRoots.map(
      (name) =>
        `(deny file-write-unlink (require-all (literal (param \"${name}\")) (vnode-type DIRECTORY)))`,
    ),
    networkPolicy(policy.network),
  ].filter((section) => section.length > 0)

  const profile = sections.join("\n")
  const definitionArgs = definitions.map(
    ({ name, path }) => `-D${name}=${path}`,
  )
  return Object.freeze({
    profile,
    definitions: Object.freeze(definitions.map((definition) => Object.freeze(definition))),
    command: Object.freeze([
      ...definitionArgs,
      "-p",
      profile,
      "--",
      ...command,
    ]),
  })
}

export function pathDirectoriesFromEnvironment(
  pathValue: string | undefined,
  cwd: string,
): readonly string[] {
  if (pathValue === undefined) return []
  const base = absolutePath(cwd, "working directory")
  return uniquePaths(
    pathValue.split(":").map((segment) =>
      absolutePath(segment.length === 0 ? base : resolve(base, segment), "PATH directory"),
    ),
  )
}

function allowMetadata(name: string): string {
  return `(allow file-read-metadata file-test-existence (literal (param \"${name}\")))`
}

function allowPath(
  actions: string,
  names: readonly string[],
): string {
  if (names.length === 0) return ""
  const filters = names.map((name) => `(subpath (param \"${name}\"))`)
  return `(allow ${actions}\n  ${filters.join("\n  ")})`
}

function networkPolicy(network: ExecutionPolicySnapshot["network"]): string {
  if (network === "denied") return ""
  return "(allow network-outbound)\n(allow network-inbound)"
}

function matchRoots(
  policy: ExecutionPolicySnapshot,
  bindings: readonly MacosSeatbeltProfileRoot[],
): readonly MatchedRoot[] {
  const paths = new Map(bindings.map((binding) => [binding.id, binding.path]))
  if (
    paths.size !== bindings.length ||
    paths.size !== policy.filesystem.roots.length
  ) {
    throw new Error("execution filesystem root binding does not match policy")
  }
  return policy.filesystem.roots.map((root) => {
    const path = paths.get(root.id)
    if (path === undefined) {
      throw new Error(`execution filesystem root binding is missing: ${root.id}`)
    }
    return { id: root.id, path, effects: root.effects }
  })
}

function executablePath(program: string, cwd: string): string | undefined {
  if (!program.includes("/")) return undefined
  return absolutePath(resolve(cwd, program), "executable")
}

function absolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`Seatbelt ${label} must be an absolute path without control characters`)
  }
  return resolve(value)
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)]
}

export type { ExecutionFileEffect }
