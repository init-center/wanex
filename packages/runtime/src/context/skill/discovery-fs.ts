import type {
  SkillDiagnostic,
  SkillDirEntry,
  SkillDiscoveryOptions,
  SkillFileStat,
  SkillScope
} from "./types.js"
import { unavailableDiagnostic } from "./discovery-diagnostics.js"

export async function safeReadDir(
  fs: SkillDiscoveryOptions["fs"] & {},
  path: string,
  scope: SkillScope
): Promise<
  | { readonly status: "available"; readonly entries?: readonly SkillDirEntry[] }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic }
> {
  try {
    const entries = await fs.readDir(path)
    return entries === undefined ? { status: "available" } : { status: "available", entries }
  } catch (error) {
    return {
      status: "unavailable",
      diagnostic: unavailableDiagnostic(path, scope, error)
    }
  }
}

export async function safeStat(
  fs: SkillDiscoveryOptions["fs"] & {},
  path: string,
  scope: SkillScope
): Promise<
  | { readonly status: "available"; readonly stat?: SkillFileStat }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic }
> {
  try {
    const stat = await fs.stat(path)
    return stat === undefined ? { status: "available" } : { status: "available", stat }
  } catch (error) {
    return {
      status: "unavailable",
      diagnostic: unavailableDiagnostic(path, scope, error)
    }
  }
}
