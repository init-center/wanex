import { safeStat } from "./discovery-fs.js"
import type {
  SkillDiagnostic,
  SkillDiscoveryOptions
} from "./types.js"

export async function observeProjectSkillRoot(
  fs: SkillDiscoveryOptions["fs"] & {},
  path: string
): Promise<
  | { readonly status: "available"; readonly exists: boolean }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic }
> {
  const stat = await safeStat(fs, path, "project")
  if (stat.status === "unavailable") {
    return stat
  }
  return {
    status: "available",
    exists: stat.stat?.isDirectory === true
  }
}
