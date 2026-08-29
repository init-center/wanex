const NATIVE_ENVIRONMENT_VARIABLES = [
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR"
] as const

export function reviewedNativeLaunchEnvironment(
  source: NodeJS.ProcessEnv,
  additions: Readonly<Record<string, string>> = {}
): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {}
  for (const name of NATIVE_ENVIRONMENT_VARIABLES) {
    const value = source[name]
    if (value !== undefined) selected[name] = value
  }
  for (const [name, value] of Object.entries(additions)) {
    if (!NATIVE_ENVIRONMENT_VARIABLES.includes(
      name as (typeof NATIVE_ENVIRONMENT_VARIABLES)[number]
    )) {
      throw new Error(`native launch environment variable is not reviewed: ${name}`)
    }
    selected[name] = value
  }
  return Object.freeze(selected)
}
