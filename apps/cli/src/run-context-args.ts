import { resolve } from "node:path"
import { parsePositiveInteger, requireValue, splitCsv } from "./parse-helpers.js"
import type { CliAgentContextOptions } from "./types.js"

export interface RunContextParseState {
  readonly context: MutableRunContextOptions
}

export interface RunContextParseResult {
  readonly handled: boolean
  readonly nextIndex: number
}

export function createRunContextParseState(): RunContextParseState {
  return {
    context: {}
  }
}

export function parseRunContextOption(
  args: readonly string[],
  index: number,
  state: RunContextParseState
): RunContextParseResult {
  const arg = args[index]
  if (arg === "--instructions-cwd") {
    state.context.instructionsCwd = requireValue(
      args,
      index + 1,
      "--instructions-cwd"
    )
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--instructions-project-root") {
    state.context.instructionsProjectRoot = requireValue(
      args,
      index + 1,
      "--instructions-project-root"
    )
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--instructions-global-dir") {
    state.context.instructionsGlobalDir = requireValue(
      args,
      index + 1,
      "--instructions-global-dir"
    )
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--trust-project-instructions") {
    state.context.trustProjectInstructions = true
    return { handled: true, nextIndex: index }
  }
  if (arg === "--skills-cwd") {
    state.context.skillsCwd = requireValue(args, index + 1, "--skills-cwd")
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--skills-project-root") {
    state.context.skillsProjectRoot = requireValue(
      args,
      index + 1,
      "--skills-project-root"
    )
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--skills-global-dir") {
    state.context.skillsGlobalDirs = [
      ...(state.context.skillsGlobalDirs ?? []),
      ...splitCsv(requireValue(args, index + 1, "--skills-global-dir"))
    ]
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--trust-project-skills") {
    state.context.trustProjectSkills = true
    return { handled: true, nextIndex: index }
  }
  if (arg === "--activate-skill-tool") {
    state.context.activateSkillTool = true
    return { handled: true, nextIndex: index }
  }
  if (arg === "--skill-activation-max-indexed-files") {
    state.context.skillActivationMaxIndexedFiles = parsePositiveInteger(
      requireValue(args, index + 1, "--skill-activation-max-indexed-files"),
      "--skill-activation-max-indexed-files"
    )
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--skill-activation-supporting-dirs") {
    state.context.skillActivationSupportingDirs = [
      ...(state.context.skillActivationSupportingDirs ?? []),
      ...splitCsv(
        requireValue(args, index + 1, "--skill-activation-supporting-dirs")
      )
    ]
    return { handled: true, nextIndex: index + 1 }
  }
  return { handled: false, nextIndex: index }
}

export function buildRunContextOptions(
  options: MutableRunContextOptions
): CliAgentContextOptions | undefined {
  const hasInstructions =
    options.instructionsCwd !== undefined ||
    options.instructionsProjectRoot !== undefined ||
    options.instructionsGlobalDir !== undefined ||
    options.trustProjectInstructions === true
  const hasSkills =
    options.skillsCwd !== undefined ||
    options.skillsProjectRoot !== undefined ||
    options.skillsGlobalDirs !== undefined ||
    options.trustProjectSkills === true ||
    options.activateSkillTool === true ||
    options.skillActivationMaxIndexedFiles !== undefined ||
    options.skillActivationSupportingDirs !== undefined

  if (!hasInstructions && !hasSkills) {
    return undefined
  }
  if (hasInstructions && options.instructionsCwd === undefined) {
    throw new Error("--instructions-cwd is required when instruction options are used")
  }
  if (hasSkills && options.skillsCwd === undefined) {
    throw new Error("--skills-cwd is required when skill options are used")
  }
  if (
    options.activateSkillTool !== true &&
    (options.skillActivationMaxIndexedFiles !== undefined ||
      options.skillActivationSupportingDirs !== undefined)
  ) {
    throw new Error("skill activation options require --activate-skill-tool")
  }

  return {
    ...(hasInstructions
      ? {
          instructions: {
            cwd: resolve(options.instructionsCwd!),
            ...(options.instructionsProjectRoot === undefined
              ? {}
              : { projectRoot: resolve(options.instructionsProjectRoot) }),
            ...(options.instructionsGlobalDir === undefined
              ? {}
              : { globalConfigDir: resolve(options.instructionsGlobalDir) }),
            ...(options.trustProjectInstructions === true
              ? { trust: { projectInstructions: "trusted" as const } }
              : {})
          }
        }
      : {}),
    ...(hasSkills
      ? {
          skills: {
            cwd: resolve(options.skillsCwd!),
            ...(options.skillsProjectRoot === undefined
              ? {}
              : { projectRoot: resolve(options.skillsProjectRoot) }),
            ...(options.skillsGlobalDirs === undefined
              ? {}
              : {
                  globalSkillDirs: options.skillsGlobalDirs.map((dir) =>
                    resolve(dir)
                  )
                }),
            ...(options.trustProjectSkills === true
              ? { trust: { projectSkills: "trusted" as const } }
              : {}),
            ...(options.activateSkillTool === true
              ? { registerActivationTool: true }
              : {}),
            ...(options.activateSkillTool === true &&
            (options.skillActivationMaxIndexedFiles !== undefined ||
              options.skillActivationSupportingDirs !== undefined)
              ? {
                  activationTool: {
                    ...(options.skillActivationMaxIndexedFiles === undefined
                      ? {}
                      : {
                          maxIndexedFiles:
                            options.skillActivationMaxIndexedFiles
                        }),
                    ...(options.skillActivationSupportingDirs === undefined
                      ? {}
                      : {
                          supportingDirectories:
                            options.skillActivationSupportingDirs
                        })
                  }
                }
              : {})
          }
        }
      : {})
  }
}

interface MutableRunContextOptions {
  instructionsCwd?: string
  instructionsProjectRoot?: string
  instructionsGlobalDir?: string
  trustProjectInstructions?: boolean
  skillsCwd?: string
  skillsProjectRoot?: string
  skillsGlobalDirs?: string[]
  trustProjectSkills?: boolean
  activateSkillTool?: boolean
  skillActivationMaxIndexedFiles?: number
  skillActivationSupportingDirs?: string[]
}
