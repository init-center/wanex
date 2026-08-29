import { isAbsolute } from "node:path";
import {
  prepareAgentContext,
  type PreparedAgentContext,
} from "@wanex/runtime/context";
import { ToolRegistry } from "@wanex/runtime/tools";
import type { CodingRepositoryContextPolicy } from "../types.js";

export async function prepareCodingRepositoryContext(request: {
  readonly rootDir: string;
  readonly policy?: CodingRepositoryContextPolicy;
  readonly base?: PreparedAgentContext;
}): Promise<PreparedAgentContext> {
  const policy = request.policy;
  const prepared = await prepareAgentContext({
    instructions: {
      cwd: request.rootDir,
      projectRoot: request.rootDir,
      trust: { projectInstructions: "trusted" },
      ...(policy?.globalConfigDir === undefined
        ? {}
        : { globalConfigDir: policy.globalConfigDir }),
      ...(policy?.instructionTargets === undefined
        ? {}
        : { targets: policy.instructionTargets }),
    },
    skills: {
      cwd: request.rootDir,
      projectRoot: request.rootDir,
      trust: { projectSkills: "trusted" },
      registerActivationTool: policy?.registerSkillActivationTool ?? true,
      ...(policy?.globalSkillDirs === undefined
        ? {}
        : { globalSkillDirs: policy.globalSkillDirs }),
      ...(policy?.projectSkillDirs === undefined
        ? {}
        : { projectSkillDirs: policy.projectSkillDirs }),
      ...(policy?.skillActivation === undefined
        ? {}
        : { activationTool: policy.skillActivation }),
    },
    ...(request.base?.contextCompiler === undefined
      ? {}
      : { downstream: request.base.contextCompiler }),
    ...(request.base?.tools === undefined
      ? {}
      : { tools: cloneTools(request.base.tools) }),
    ...(request.base?.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: request.base.toolPermissionPolicy }),
  });
  return {
    ...request.base,
    ...prepared,
    ...(request.base?.capabilityRoutes === undefined
      ? {}
      : { capabilityRoutes: request.base.capabilityRoutes }),
  };
}

function cloneTools(source: ToolRegistry): ToolRegistry {
  const clone = new ToolRegistry();
  for (const descriptor of source.list()) {
    const definition = source.get(descriptor.name);
    if (definition === undefined) {
      throw new Error(
        `Coding base Tool registry changed during context preparation: ${descriptor.name}`,
      );
    }
    clone.register(definition);
  }
  return clone;
}

export function normalizeCodingRepositoryContextPolicy(
  policy: CodingRepositoryContextPolicy | undefined,
): CodingRepositoryContextPolicy | undefined {
  if (policy === undefined) return undefined;
  if (
    policy.globalConfigDir !== undefined &&
    !isTrustedAbsolutePath(policy.globalConfigDir)
  ) {
    throw new Error("Coding global instruction directory must be absolute");
  }
  for (const directory of policy.globalSkillDirs ?? []) {
    if (!isTrustedAbsolutePath(directory)) {
      throw new Error("Coding global Skill directories must be absolute");
    }
  }
  validateTargets(policy.instructionTargets);
  validateRelativeDirectories(
    policy.projectSkillDirs,
    "Coding project Skill directories",
  );
  validateRelativeDirectories(
    policy.skillActivation?.supportingDirectories,
    "Coding Skill supporting directories",
  );
  if (
    policy.skillActivation?.maxIndexedFiles !== undefined &&
    (!Number.isSafeInteger(policy.skillActivation.maxIndexedFiles) ||
      policy.skillActivation.maxIndexedFiles < 1 ||
      policy.skillActivation.maxIndexedFiles > 1_024)
  ) {
    throw new Error(
      "Coding Skill activation maxIndexedFiles must be between 1 and 1024",
    );
  }
  return Object.freeze({
    ...(policy.globalConfigDir === undefined
      ? {}
      : { globalConfigDir: policy.globalConfigDir }),
    ...(policy.instructionTargets === undefined
      ? {}
      : { instructionTargets: Object.freeze([...policy.instructionTargets]) }),
    ...(policy.globalSkillDirs === undefined
      ? {}
      : { globalSkillDirs: Object.freeze([...policy.globalSkillDirs]) }),
    ...(policy.projectSkillDirs === undefined
      ? {}
      : { projectSkillDirs: Object.freeze([...policy.projectSkillDirs]) }),
    ...(policy.registerSkillActivationTool === undefined
      ? {}
      : {
          registerSkillActivationTool: policy.registerSkillActivationTool,
        }),
    ...(policy.skillActivation === undefined
      ? {}
      : {
          skillActivation: Object.freeze({
            ...(policy.skillActivation.maxIndexedFiles === undefined
              ? {}
              : {
                  maxIndexedFiles: policy.skillActivation.maxIndexedFiles,
                }),
            ...(policy.skillActivation.supportingDirectories === undefined
              ? {}
              : {
                  supportingDirectories: Object.freeze([
                    ...policy.skillActivation.supportingDirectories,
                  ]),
                }),
          }),
        }),
  });
}

function isTrustedAbsolutePath(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= 4_096 &&
    !value.includes("\0") &&
    isAbsolute(value)
  );
}

function validateTargets(values: readonly string[] | undefined): void {
  if (values === undefined) return;
  if (
    values.length < 1 ||
    values.length > 16 ||
    values.some(
      (value) =>
        value.length < 1 ||
        value.length > 256 ||
        value.includes("\0") ||
        value.includes("/") ||
        value.includes("\\") ||
        value === "." ||
        value === "..",
    )
  ) {
    throw new Error("Coding instruction targets are invalid");
  }
}

function validateRelativeDirectories(
  values: readonly string[] | undefined,
  label: string,
): void {
  if (values === undefined) return;
  if (
    values.length < 1 ||
    values.length > 16 ||
    values.some(
      (value) =>
        value.length > 1_024 ||
        isAbsolute(value) ||
        value.includes("\0") ||
        value
          .split(/[\\/]/u)
          .some((part) => part.length === 0 || part === "." || part === ".."),
    )
  ) {
    throw new Error(`${label} are invalid`);
  }
}
