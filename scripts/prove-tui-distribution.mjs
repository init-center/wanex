#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { promisify } from "node:util"
import {
  buildTuiDistribution,
  distributionRoot,
  packageRoot,
  stagingDir,
  tarballDir,
  workspaceRoot
} from "../apps/tui/scripts/distribution.mjs"
import {
  loadSdkDistributionPolicy,
  nativePackageForHost
} from "./sdk/distribution-policy.mjs"
import {
  loadNativeRegistryPackages,
  startReadOnlyNpmRegistry
} from "./external-consumers/registry.mjs"
import {
  prepareExternalNativePackage
} from "./external-consumers/native-package-proof.mjs"
import {
  inspectExternalInstalledWanex,
  inspectExternalPackageLock,
  expectedInstalledWanexClosure,
  expectedWanexClosure
} from "./external-consumers/runner.mjs"
import { resolveStepCommand } from "./process-step.mjs"

const execFileAsync = promisify((await import("node:child_process")).execFile)

const installedPrimaryAssistantText = "installed TUI canonical Provider reply"
const installedTeamTitle = "Installed coordination"
const installedTeamUserText = "installed TUI coordinated group proof"
const installedTeamAssistantText = "installed TUI coordinated Team reply"
const installedTuiPtyJourneyTimeoutMs = 90_000

export function installedTuiPtyJourneyIds() {
  return ["provider-lifecycle", "team", "final-provider-removal"]
}

export function installedTuiProviderJourneySteps() {
  return [
    "expect -exact \"Wanex Provider Setup\"",
    "expect -exact \"Provider \\[1-4\\]: \"",
    "send -- \"4\\r\"",
    "expect -exact \"Model ID: \"",
    "send -- \"installed-assistant-tui-model\\r\"",
    "expect -exact \"Base URL: \"",
    "send -- \"$base_url\\r\"",
    "expect -exact \"API key: \"",
    "send -- \"$credential\\r\"",
    "set credential \"\"",
    "expect -exact \"Ready | installed-assistant-tui-model\"",
    "send -- \"\\033\\\[19~\"",
    "expect -exact \"Wanex Provider Management\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"1\\r\"",
    "expect -exact \"Provider \\[1-4\\]: \"",
    "send -- \"4\\r\"",
    "expect -exact \"Model ID: \"",
    "send -- \"installed-secondary-model\\r\"",
    "expect -exact \"Base URL: \"",
    "send -- \"$secondary_base_url\\r\"",
    "expect -exact \"API key: \"",
    "send -- \"$secondary_credential\\r\"",
    "set secondary_credential \"\"",
    "expect -exact \"Provider added.\"",
    "expect -exact \"Press Enter to continue...\"",
    "send -- \"\\r\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"5\\r\"",
    "expect -exact \"Ready | installed-assistant-tui-model\"",
    "send -- \"\\033OQ\"",
    "expect -exact \"Models\"",
    "send -- \"\\033\\\[B\"",
    "send -- \"\\r\"",
    "expect -exact \"Model selected | installed-secondary-model\"",
    "expect -re {Send \\|[^\\r\\n]*Enter submit}",
    "send -- \"$secondary_prompt\\r\"",
    "expect -exact $secondary_reply",
    "expect -exact \"Wanex | completed\"",
    "send -- \"\\033\\\[19~\"",
    "expect -exact \"Wanex Provider Management\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"2\\r\"",
    "expect -exact \"Provider \\[1-2\\]: \"",
    "send -- \"$secondary_choice\\r\"",
    "expect -exact \"API key: \"",
    "send -- \"$rotated_credential\\r\"",
    "set rotated_credential \"\"",
    "expect -exact \"Credential rotated.\"",
    "expect -exact \"Press Enter to continue...\"",
    "send -- \"\\r\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"5\\r\"",
    "expect -exact \"Ready | installed-secondary-model\"",
    "expect -re {Send \\|[^\\r\\n]*Enter submit}",
    "send -- \"$rotated_prompt\\r\"",
    "expect -exact $rotated_reply",
    "expect -exact \"Wanex | completed\"",
    "send -- \"\\033\\\[19~\"",
    "expect -exact \"Wanex Provider Management\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"3\\r\"",
    "expect -exact \"Provider \\[1-2\\]: \"",
    "send -- \"$secondary_choice\\r\"",
    "expect -exact \"New model ID for installed-secondary-model: \"",
    "send -- \"installed-secondary-model-edited\\r\"",
    "expect -exact \"Model ID updated.\"",
    "expect -exact \"Press Enter to continue...\"",
    "send -- \"\\r\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"5\\r\"",
    "expect -exact \"Ready | installed-secondary-model-edited\"",
    "expect -re {Send \\|[^\\r\\n]*Enter submit}",
    "send -- \"$edited_prompt\\r\"",
    "expect -exact $edited_reply",
    "expect -exact \"Wanex | completed\"",
    "send -- \"\\033\\\[19~\"",
    "expect -exact \"Wanex Provider Management\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"4\\r\"",
    "expect -exact \"Provider \\[1-2\\]: \"",
    "send -- \"$secondary_choice\\r\"",
    "expect -exact \"Type REMOVE to delete\"",
    "send -- \"REMOVE\\r\"",
    "expect -exact \"Provider removed. Active model: \"",
    "expect -exact \"Press Enter to continue...\"",
    "send -- \"\\r\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"5\\r\"",
    "expect -exact \"Ready | installed-assistant-tui-model\"",
    "expect -re {Send \\|[^\\r\\n]*Enter submit}",
    "send -- \"$fallback_prompt\\r\"",
    "expect -exact $fallback_reply",
    "expect -exact \"Wanex | completed\"",
    "send -- \"\\021\"",
    "expect eof",
    "set status [wait]",
    "exit [lindex $status 3]"
  ]
}

export const installedTuiProofPath = join(
  distributionRoot,
  "installed-proof.json"
)

export function installedTuiTeamAgentSetupReadySteps() {
  return [
    "expect -exact \"Add an agent before sending\"",
    "expect -re {Send \\|[^\\r\\n]*Enter send}",
    "send -- \"\\033OR\"",
    "expect -exact \"Group details\"",
    "send -- \"\\r\"",
    "expect -exact $secondary_prompt",
    "send -- \"\\r\"",
    "expect -exact \"Agent added\"",
    "expect -exact \"Group details\""
  ]
}

export function installedTuiTeamComposerReadySteps() {
  return [
    "expect -re {Send \\|[^\\r\\n]*Enter send}",
    "send -- \"\\033\\\[27u\"",
    "send -- \"$team_prompt\"",
    "expect -exact $team_prompt",
    "send -- \"\\r\""
  ]
}

export function installedTuiTeamJourneySteps() {
  return [
    "expect -exact \"Ready | installed-assistant-tui-model\"",
    "send -- \"\\017\"",
    "expect -exact \"Conversations\"",
    "expect -exact \"New group\"",
    "send -- \"\\033\\\[B\"",
    "send -- \"\\r\"",
    "expect -exact \"Give this group a short title.\"",
    "send -- \"$team_title\\r\"",
    "expect -exact \"Group mode\"",
    "send -- \"\\r\"",
    "expect -exact \"Group created\"",
    "expect -exact $team_title",
    ...installedTuiTeamAgentSetupReadySteps(),
    "send -- \"\\033\\\[B\"",
    "send -- \"\\033\\\[B\"",
    "send -- \"\\r\"",
    "expect -exact \"Set as coordinator\"",
    "send -- \"\\033\\\[B\"",
    "send -- \"\\r\"",
    "expect -exact \"Set coordinator?\"",
    "send -- \"\\r\"",
    "expect -exact \"Coordinator updated\"",
    "expect -exact \"Group details\"",
    ...installedTuiTeamComposerReadySteps(),
    "expect -exact \"Coordinator replied\"",
    "expect -exact $team_reply",
    "send -- \"\\017\"",
    "expect -exact \"Conversations\"",
    "expect -exact $team_title",
    "send -- \"\\033\\\[A\"",
    "send -- \"\\033\\\[A\"",
    "send -- \"\\r\"",
    "expect -exact \"Conversation selected\"",
    "expect -exact $fallback_prompt",
    "send -- \"\\021\"",
    "expect eof",
    "set status [wait]",
    "exit [lindex $status 3]"
  ]
}

export function installedTuiFinalRemovalJourneySteps() {
  return [
    "expect -exact \"Ready | installed-assistant-tui-model\"",
    "send -- \"\\033\\\[19~\"",
    "expect -exact \"Wanex Provider Management\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"4\\r\"",
    "expect -exact \"Provider \\[1-1\\]: \"",
    "send -- \"1\\r\"",
    "expect -exact \"Type REMOVE to delete\"",
    "send -- \"REMOVE\\r\"",
    "expect -exact \"No configured conversation Provider remains.\"",
    "expect -exact \"Press Enter to continue...\"",
    "send -- \"\\r\"",
    "expect -exact \"Action \\[1-5\\]: \"",
    "send -- \"5\\r\"",
    "expect -exact \"Select a model provider\"",
    "send -- \"\\021\"",
    "expect eof",
    "set status [wait]",
    "exit [lindex $status 3]"
  ]
}

export async function writeInstalledTuiProofReceipt(
  receipt,
  outputPath = installedTuiProofPath
) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(
    outputPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8"
  )
  return outputPath
}

if (import.meta.main) {
  try {
    const receipt = await proveInstalledTui(
      parseTuiProofArgs(process.argv.slice(2))
    )
    await writeInstalledTuiProofReceipt(receipt)
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
}

export function parseTuiProofArgs(args) {
  let nativeArtifactDir
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    if (name !== "--native-artifact-dir") {
      throw new Error(`unknown TUI proof argument: ${String(name)}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a path`)
    nativeArtifactDir = resolve(value)
    index += 1
  }
  return nativeArtifactDir === undefined ? {} : { nativeArtifactDir }
}

export async function proveInstalledTui(options = {}) {
  const distribution = await buildTuiDistribution()
  const publicDistribution = {
    ...distribution,
    tarball: {
      ...distribution.tarball,
      path: relative(workspaceRoot, distribution.tarball.path).replaceAll("\\", "/")
    }
  }
  const policy = await loadSdkDistributionPolicy()
  const nativePackage = nativePackageForHost(policy)
  const sourceServiceBin = options.nativeArtifactDir === undefined
    ? resolve(
      workspaceRoot,
      `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
    )
    : undefined
  if (sourceServiceBin !== undefined) {
    await access(sourceServiceBin, constants.F_OK)
  }
  const nativeReport = await prepareExternalNativePackage({
    workspaceRoot,
    nativePackage,
    ...(sourceServiceBin === undefined ? {} : { sourceServiceBin }),
    ...(options.nativeArtifactDir === undefined
      ? {}
      : { nativeArtifactDir: options.nativeArtifactDir })
  })
  const tuiManifest = JSON.parse(
    await readFile(join(stagingDir, "package.json"), "utf8")
  )
  const tuiBytes = await readFile(distribution.tarball.path)
  const nativePackages = await loadNativeRegistryPackages(policy, nativeReport)
  const registry = await startReadOnlyNpmRegistry({
    packages: [
      { manifest: tuiManifest, filename: distribution.tarball.filename, bytes: tuiBytes },
      ...nativePackages
    ]
  })

  try {
    return await withWorkspaceExternalRoot(async (externalRoot) => {
      const provider = await listenProvider({
        assistantText: installedPrimaryAssistantText,
        reply({ body }) {
          return providerBodyContainsInput(body, installedTeamUserText)
            ? installedTeamAssistantText
            : installedPrimaryAssistantText
        }
      })
      const secondaryProvider = await listenProvider({
        assistantText: "installed TUI secondary Provider reply",
        credential: "installed-assistant-tui-secondary-secret",
        reply({ authorization, body }) {
          if (authorization ===
            "Bearer installed-assistant-tui-secondary-secret") {
            return "installed TUI secondary initial reply"
          }
          if (body?.model === "installed-secondary-model-edited") {
            return "installed TUI secondary edited reply"
          }
          return "installed TUI secondary rotated reply"
        }
      })
      try {
        const installed = await installExternalTui({
          externalRoot,
          registry,
          registryPackages: [
            { manifest: tuiManifest, filename: distribution.tarball.filename, bytes: tuiBytes },
            ...nativePackages
          ]
        })
        await assertFilesDoNotContain(
          join(installed.projectDir, "node_modules/@wanex/tui"),
          [provider.fixture.credential],
          "installed TUI package"
        )
        const line = await runInstalledLineTui({
          projectDir: installed.projectDir,
          provider: provider.fixture
        })
        const pty = process.platform !== "win32"
            ? await runInstalledFullScreenTui({
              projectDir: installed.projectDir,
              provider: provider.fixture,
              secondaryProvider: secondaryProvider.fixture
            })
          : {
            status: "platform_not_run",
            platform: process.platform,
            reason: "windows distribution proof uses the line-mode contract"
          }
        return {
          kind: "wanex.tui.installed-proof-receipt",
          ok: true,
          distribution: {
            tarball: publicDistribution.tarball,
            staging: distribution.staging
          },
          host: { platform: process.platform, arch: process.arch },
          installed: {
            projectDirOutsideWorkspace: true,
            wanexClosure: installed.installedWanexClosure,
            packageLockChecked: true
          },
          line,
          pty,
          registryRequests: registry.requests.length,
          nativeTarget: nativePackage.targetId
        }
      } finally {
        await secondaryProvider.close()
        await provider.close()
      }
    })
  } finally {
    await registry.close()
  }
}

async function withWorkspaceExternalRoot(run) {
  const allowedRoot = dirname(dirname(workspaceRoot))
  const externalRoot = await mkdtemp(join(
    allowedRoot,
    ".wanex-tui-proof-"
  ))
  try {
    return await run(externalRoot)
  } finally {
    await rm(externalRoot, { recursive: true, force: true })
  }
}

async function installExternalTui(options) {
  const projectDir = join(options.externalRoot, "installed-tui")
  const npmCache = join(options.externalRoot, "npm-cache")
  await mkdir(projectDir, { recursive: true })
  await mkdir(npmCache, { recursive: true })
  await writeFile(
    join(projectDir, "package.json"),
    `${JSON.stringify({
      name: "wanex-installed-tui",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies: { "@wanex/tui": "0.0.0" }
    }, null, 2)}\n`,
    "utf8"
  )
  await writeFile(
    join(projectDir, ".npmrc"),
    `@wanex:registry=${options.registry.endpoint}\n`,
    "utf8"
  )
  const environment = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_update_notifier: "false"
  }
  const install = resolveStepCommand({
    command: "npm",
    args: ["install", "--ignore-scripts", "--no-audit", "--no-fund"]
  }, { env: environment })
  await execFileAsync(install.command, install.args, {
    cwd: projectDir,
    env: environment,
    maxBuffer: 30 * 1024 * 1024
  })

  const registryPackages = options.registryPackages
  const resolvedWanexClosure = expectedWanexClosure(
    ["@wanex/tui"],
    registryPackages
  )
  const installedWanexClosure = expectedInstalledWanexClosure(
    ["@wanex/tui"],
    registryPackages
  )
  const lock = JSON.parse(await readFile(join(projectDir, "package-lock.json"), "utf8"))
  const lockFailures = inspectExternalPackageLock({
    lock,
    topLevelNames: ["@wanex/tui"],
    expectedWanex: resolvedWanexClosure,
    forbiddenPaths: [workspaceRoot, packageRoot]
  })
  if (lockFailures.length > 0) {
    throw new Error(`installed TUI package lock failed:\n${lockFailures.join("\n")}`)
  }
  const installedFailures = await inspectExternalInstalledWanex({
    projectDir,
    expectedWanex: installedWanexClosure
  })
  if (installedFailures.length > 0) {
    throw new Error(`installed TUI Wanex closure failed:\n${installedFailures.join("\n")}`)
  }
  const installedTuiDir = join(projectDir, "node_modules/@wanex/tui")
  const installedTuiFiles = await listRelativeFiles(installedTuiDir)
  const invalidTuiFiles = installedTuiFiles.filter((path) =>
    path.endsWith(".ts") ||
    path.endsWith(".map") ||
    /(^|\/)(?:src|test|tests|fixtures|node_modules)(\/|$)/.test(path)
  )
  if (invalidTuiFiles.length > 0) {
    throw new Error(
      `installed TUI contains source leakage: ${invalidTuiFiles.join(",")}`
    )
  }
  return { projectDir, installedWanexClosure }
}

async function runInstalledTuiPtyJourney(options) {
  return execFileAsync(
    "/usr/bin/expect",
    [options.script, options.transcript, ...options.args],
    {
      cwd: options.projectDir,
      env: options.environment,
      timeout: installedTuiPtyJourneyTimeoutMs,
      maxBuffer: 20 * 1024 * 1024
    }
  )
}

async function runInstalledLineTui(options) {
  const providerEnv = providerEnvironment(options.provider)
  const storeDir = join(options.projectDir, ".proof-line-store")
  const entry = join(
    options.projectDir,
    "node_modules/@wanex/tui/dist/wanex-tui.js"
  )
  const child = spawn(process.execPath, [entry, "interactive"], {
    cwd: options.projectDir,
    env: { ...process.env, ...providerEnv, WANEX_STORE_DIR: storeDir },
    stdio: ["pipe", "pipe", "pipe"]
  })
  const output = collectChildOutput(child)
  await waitForOutput(output, child, "Type help for commands.", 20_000)
  child.stdin.write("ask installed TUI line proof\n")
  await waitForOutput(
    output,
    child,
    `assistant:${options.provider.assistantText}`,
    60_000
  )
  child.stdin.end("quit\n")
  const result = await waitForChild(child, output, 20_000)
  if (result.code !== 0) {
    throw new Error(
      `installed TUI line session exited with ${String(result.code)}: ${result.stderr}`
    )
  }
  assertCommonTuiOutput(result.stdout + result.stderr, options.provider, {
    storeDir,
    projectDir: options.projectDir
  })
  assertProviderRequest(options.provider, "installed TUI line proof")
  await assertNoProcessContaining(storeDir)
  await assertFilesDoNotContain(
    storeDir,
    [options.provider.credential],
    "installed TUI line store"
  )
  return {
    mode: "line",
    assistantText: options.provider.assistantText,
    providerAuthorized: options.provider.authorized,
    stdoutBytes: Buffer.byteLength(result.stdout)
  }
}

async function runInstalledFullScreenTui(options) {
  const storeDir = join(options.projectDir, ".proof-pty-store")
  const providerTranscript = join(
    options.projectDir,
    "pty-provider-transcript.txt"
  )
  const teamTranscript = join(options.projectDir, "pty-team-transcript.txt")
  const finalRemovalTranscript = join(
    options.projectDir,
    "pty-final-removal-transcript.txt"
  )
  const providerExpectScript = join(options.projectDir, "pty-provider-proof.exp")
  const teamExpectScript = join(options.projectDir, "pty-team-proof.exp")
  const finalRemovalExpectScript = join(
    options.projectDir,
    "pty-final-removal-proof.exp"
  )
  const credentialInput = join(options.projectDir, ".pty-credential-input")
  const secondaryCredentialInput = join(
    options.projectDir,
    ".pty-secondary-credential-input"
  )
  const rotatedCredentialInput = join(
    options.projectDir,
    ".pty-rotated-credential-input"
  )
  const entry = join(
    options.projectDir,
    "node_modules/@wanex/tui/dist/wanex-tui.js"
  )
  const secondaryUserText = "installed TUI secondary proof"
  const rotatedUserText = "installed TUI rotated proof"
  const editedUserText = "installed TUI edited proof"
  const fallbackUserText = "installed TUI fallback proof"
  const rotatedCredential = "installed-assistant-tui-secondary-rotated-secret"
  const connectionIds = [
    customProviderConnectionId(options.provider.baseUrl),
    customProviderConnectionId(options.secondaryProvider.baseUrl)
  ].sort()
  const secondaryChoice = String(
    connectionIds.indexOf(
      customProviderConnectionId(options.secondaryProvider.baseUrl)
    ) + 1
  )
  const environment = tuiEnvironment({ WANEX_STORE_DIR: storeDir })
  let stdout = ""
  let stderr = ""
  let providerTranscriptText = ""
  let teamTranscriptText = ""
  let finalRemovalTranscriptText = ""
  let failure
  try {
    await Promise.all([
      writeFile(credentialInput, options.provider.credential, {
        encoding: "utf8",
        mode: 0o600
      }),
      writeFile(secondaryCredentialInput, options.secondaryProvider.credential, {
        encoding: "utf8",
        mode: 0o600
      }),
      writeFile(rotatedCredentialInput, rotatedCredential, {
        encoding: "utf8",
        mode: 0o600
      }),
      writeFile(
        providerExpectScript,
        [
          "set timeout 60",
          "match_max 1048576",
          "log_user 0",
          "set transcript [lindex $argv 0]",
          "set node [lindex $argv 1]",
          "set entry [lindex $argv 2]",
          "set base_url [lindex $argv 3]",
          "set credential_input [lindex $argv 4]",
          "set secondary_base_url [lindex $argv 5]",
          "set secondary_credential_input [lindex $argv 6]",
          "set rotated_credential_input [lindex $argv 7]",
          "set secondary_choice [lindex $argv 8]",
          "set secondary_prompt [lindex $argv 9]",
          "set secondary_reply [lindex $argv 10]",
          "set rotated_prompt [lindex $argv 11]",
          "set rotated_reply [lindex $argv 12]",
          "set edited_prompt [lindex $argv 13]",
          "set edited_reply [lindex $argv 14]",
          "set fallback_prompt [lindex $argv 15]",
          "set fallback_reply [lindex $argv 16]",
          "set channel [open $credential_input r]",
          "set credential [read -nonewline $channel]",
          "close $channel",
          "set channel [open $secondary_credential_input r]",
          "set secondary_credential [read -nonewline $channel]",
          "close $channel",
          "set channel [open $rotated_credential_input r]",
          "set rotated_credential [read -nonewline $channel]",
          "close $channel",
          "log_file -noappend -a $transcript",
          "spawn -noecho $node $entry fullscreen",
          ...installedTuiProviderJourneySteps()
        ].join("\n") + "\n",
        "utf8"
      ),
      writeFile(
        teamExpectScript,
        [
          "set timeout 60",
          "match_max 1048576",
          "log_user 0",
          "set transcript [lindex $argv 0]",
          "set node [lindex $argv 1]",
          "set entry [lindex $argv 2]",
          "set secondary_prompt [lindex $argv 3]",
          "set fallback_prompt [lindex $argv 4]",
          "set team_title [lindex $argv 5]",
          "set team_prompt [lindex $argv 6]",
          "set team_reply [lindex $argv 7]",
          "log_file -noappend -a $transcript",
          "spawn -noecho $node $entry fullscreen",
          ...installedTuiTeamJourneySteps()
        ].join("\n") + "\n",
        "utf8"
      ),
      writeFile(
        finalRemovalExpectScript,
        [
          "set timeout 60",
          "match_max 1048576",
          "log_user 0",
          "set transcript [lindex $argv 0]",
          "set node [lindex $argv 1]",
          "set entry [lindex $argv 2]",
          "log_file -noappend -a $transcript",
          "spawn -noecho $node $entry fullscreen",
          ...installedTuiFinalRemovalJourneySteps()
        ].join("\n") + "\n",
        "utf8"
      )
    ])
    const providerResult = await runInstalledTuiPtyJourney({
      script: providerExpectScript,
      transcript: providerTranscript,
      args: [
        process.execPath,
        entry,
        options.provider.baseUrl,
        credentialInput,
        options.secondaryProvider.baseUrl,
        secondaryCredentialInput,
        rotatedCredentialInput,
        secondaryChoice,
        secondaryUserText,
        "installed TUI secondary initial reply",
        rotatedUserText,
        "installed TUI secondary rotated reply",
        editedUserText,
        "installed TUI secondary edited reply",
        fallbackUserText,
        options.provider.assistantText
      ],
      projectDir: options.projectDir,
      environment
    })
    stdout = providerResult.stdout
    stderr = providerResult.stderr
    await assertNoProcessContaining(storeDir)

    const teamResult = await runInstalledTuiPtyJourney({
      script: teamExpectScript,
      transcript: teamTranscript,
      args: [
        process.execPath,
        entry,
        secondaryUserText,
        fallbackUserText,
        installedTeamTitle,
        installedTeamUserText,
        installedTeamAssistantText
      ],
      projectDir: options.projectDir,
      environment
    })
    stdout += teamResult.stdout
    stderr += teamResult.stderr
    await assertNoProcessContaining(storeDir)

    const finalRemovalResult = await runInstalledTuiPtyJourney({
      script: finalRemovalExpectScript,
      transcript: finalRemovalTranscript,
      args: [
        process.execPath,
        entry
      ],
      projectDir: options.projectDir,
      environment
    })
    stdout += finalRemovalResult.stdout
    stderr += finalRemovalResult.stderr
    assertExactProviderRequest(options.secondaryProvider, {
      input: secondaryUserText,
      credential: options.secondaryProvider.credential,
      modelId: "installed-secondary-model"
    })
    assertExactProviderRequest(options.secondaryProvider, {
      input: rotatedUserText,
      credential: rotatedCredential,
      modelId: "installed-secondary-model"
    })
    assertExactProviderRequest(options.secondaryProvider, {
      input: editedUserText,
      credential: rotatedCredential,
      modelId: "installed-secondary-model-edited"
    })
    assertExactProviderRequest(options.provider, {
      input: fallbackUserText,
      credential: options.provider.credential,
      modelId: "installed-assistant-tui-model"
    })
    assertExactProviderRequest(options.provider, {
      input: installedTeamUserText,
      credential: options.provider.credential,
      modelId: "installed-assistant-tui-model"
    })
    if (!options.provider.authorized) {
      throw new Error(
        "installed TUI PTY Provider did not receive exact Bearer credential"
      )
    }
    await assertNoProcessContaining(storeDir)
    providerTranscriptText = await readFile(providerTranscript, "utf8")
    if (!providerTranscriptText.includes(options.provider.assistantText)) {
      throw new Error("installed TUI PTY transcript misses assistant output")
    }
    if (!providerTranscriptText.includes(fallbackUserText)) {
      throw new Error("installed TUI Provider journey misses fallback evidence")
    }
    teamTranscriptText = await readFile(teamTranscript, "utf8")
    for (const value of [
      installedTeamTitle,
      installedTeamUserText,
      installedTeamAssistantText,
      "Coordinator replied",
      fallbackUserText
    ]) {
      if (!teamTranscriptText.includes(value)) {
        throw new Error(`installed TUI PTY transcript misses Team evidence: ${value}`)
      }
    }
    assertNoForbiddenValues(
      teamTranscriptText,
      ["participant_", "round_", "delivery_", "team_conversation_"],
      "installed TUI PTY Team transcript"
    )
    finalRemovalTranscriptText = await readFile(finalRemovalTranscript, "utf8")
    for (const [label, value] of [
      ["Provider", providerTranscriptText],
      ["Team", teamTranscriptText],
      ["final removal", finalRemovalTranscriptText]
    ]) {
      if (!value.includes("\x1b[?2004l")) {
        throw new Error(`installed TUI ${label} journey missed terminal restoration`)
      }
    }
    if (
      teamTranscriptText.includes("Wanex Provider Setup") ||
      finalRemovalTranscriptText.includes("Wanex Provider Setup")
    ) {
      throw new Error("installed TUI relaunch repeated Provider setup")
    }
    if (
      !teamTranscriptText.includes("Ready | installed-assistant-tui-model") ||
      !finalRemovalTranscriptText.includes("Ready | installed-assistant-tui-model")
    ) {
      throw new Error("installed TUI relaunch missed configured model")
    }
    if (!finalRemovalTranscriptText.includes("Select a model provider")) {
      throw new Error(
        "installed TUI final removal missed unconfigured readiness"
      )
    }
    assertTerminalPrivacy(stdout + stderr, options.provider, {
      storeDir,
      projectDir: options.projectDir,
      label: "installed TUI PTY output"
    })
    assertNoForbiddenValues(
      stdout + stderr,
      [options.secondaryProvider.credential, rotatedCredential],
      "installed TUI PTY output"
    )
    await assertFilesDoNotContain(
      storeDir,
      [
        options.provider.credential,
        options.secondaryProvider.credential,
        rotatedCredential
      ],
      "installed TUI PTY store"
    )
    for (const [label, path] of [
      ["Provider", providerTranscript],
      ["Team", teamTranscript],
      ["final removal", finalRemovalTranscript]
    ]) {
      await assertFilesDoNotContain(
        path,
        [
          options.provider.credential,
          options.secondaryProvider.credential,
          rotatedCredential
        ],
        `installed TUI PTY ${label} transcript`
      )
    }
  } catch (error) {
    const transcriptDiagnostic = await readTranscriptDiagnostic(
      [providerTranscript, teamTranscript, finalRemovalTranscript],
      [
        options.provider.credential,
        options.secondaryProvider.credential,
        rotatedCredential,
        storeDir,
        options.projectDir,
        workspaceRoot
      ]
    )
    failure = error?.stdout === undefined && error?.stderr === undefined
      ? new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
        transcriptDiagnostic,
        { cause: error }
      )
      : new Error(
        "installed TUI Expect proof failed:\n" +
        `message=${error instanceof Error ? error.message : String(error)}\n` +
        `code=${String(error?.code ?? "unknown")}\n` +
        `signal=${String(error?.signal ?? "none")}\n` +
        `stdout:\n${error?.stdout ?? ""}\n` +
        `stderr:\n${error?.stderr ?? ""}\n` +
        transcriptDiagnostic,
        { cause: error }
      )
  }
  let credentialEvidence
  let cleanupFailure
  try {
    credentialEvidence = cleanupInstalledTuiCredentials({
      projectDir: options.projectDir,
      storeDir,
      expectedCredentials: [],
      allowAny: failure !== undefined
    })
  } catch (error) {
    cleanupFailure = error
  }
  await Promise.all([
    rm(credentialInput, { force: true }),
    rm(secondaryCredentialInput, { force: true }),
    rm(rotatedCredentialInput, { force: true }),
    rm(providerExpectScript, { force: true }),
    rm(teamExpectScript, { force: true }),
    rm(finalRemovalExpectScript, { force: true })
  ])
  if (failure !== undefined && cleanupFailure !== undefined) {
    throw new Error(
      "installed TUI proof and credential cleanup failed:\n" +
      `proof: ${errorMessage(failure)}\n` +
      `cleanup: ${errorMessage(cleanupFailure)}`,
      { cause: new AggregateError([failure, cleanupFailure]) }
    )
  }
  if (failure !== undefined) throw failure
  if (cleanupFailure !== undefined) throw cleanupFailure
  if (credentialEvidence === undefined) {
    throw new Error("installed TUI keychain evidence is missing")
  }
  await assertFilesDoNotContain(
    options.projectDir,
    [
      options.provider.credential,
      options.secondaryProvider.credential,
      rotatedCredential
    ],
    "installed TUI external project"
  )
  return {
    mode: "pty",
    onboardedFromEmptyStore: true,
    lifecycleManagedWithoutRestart: true,
    relaunchSkippedSetup: true,
    finalProviderState: "unconfigured",
    credentialsExercised: 3,
    keychainCredentialCount: credentialEvidence.credentialCount,
    terminalRestored: true,
    assistantText: options.provider.assistantText,
    team: {
      mode: "coordinated",
      existingAgentAdded: true,
      coordinatorAssigned: true,
      publicReply: installedTeamAssistantText,
      originalSessionRestored: true
    },
    journeyCount: installedTuiPtyJourneyIds().length,
    stdoutBytes: Buffer.byteLength(stdout),
    transcriptBytes:
      Buffer.byteLength(providerTranscriptText) +
      Buffer.byteLength(teamTranscriptText) +
      Buffer.byteLength(finalRemovalTranscriptText)
  }
}

async function readTranscriptDiagnostic(paths, forbidden) {
  const diagnostics = []
  for (const path of paths) {
    const source = await readFile(path, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return undefined
      throw error
    })
    if (source === undefined) continue
    let output = source
    for (const value of forbidden) {
      if (value.length > 0) output = output.replaceAll(value, "[REDACTED]")
    }
    output = output
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
      .replace(/\u001b[()][0-2A-Z]/g, "")
      .replace(/\r/g, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/g, "")
    diagnostics.push(
      `${path.split("pty-").at(-1)?.replace("-transcript.txt", "") ?? "PTY"} ` +
      `transcript tail:\n${output.slice(-16_000)}`
    )
  }
  return diagnostics.length === 0
    ? "no PTY transcript was created"
    : diagnostics.join("\n")
}

async function listenProvider(options = {}) {
  const requests = []
  const assistantText = options.assistantText ??
    "installed TUI canonical Provider reply"
  const credential = options.credential ?? "installed-assistant-tui-secret"
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const observed = {
      authorization: request.headers.authorization ?? "",
      body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
    }
    const reply = options.reply?.(observed) ?? assistantText
    requests.push({ ...observed, reply })
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end([
      `data: ${JSON.stringify({ choices: [{ delta: { content: reply }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n"
    ].join(""))
  })
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    await closeServer(server)
    throw new Error("installed TUI Provider fixture did not bind")
  }
  return {
    fixture: {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      assistantText,
      credential,
      requests,
      get authorized() {
        return requests.length > 0 && requests.every((request) =>
          request.authorization === `Bearer ${credential}`
        )
      }
    },
    requests,
    async close() {
      await closeServer(server)
    }
  }
}

function providerEnvironment(provider) {
  return {
    WANEX_MODEL_ENDPOINT_ID: "installed-assistant-tui-provider",
    WANEX_PROVIDER_CONNECTION_ID: "installed-assistant-tui-connection",
    WANEX_PROVIDER_PROTOCOL: "openai-chat-completions",
    WANEX_PROVIDER_ID: "openai-compatible",
    WANEX_PROVIDER_BASE_URL: provider.baseUrl,
    WANEX_PROVIDER_SECRET_REF: "env://WANEX_INSTALLED_TUI_PROVIDER_KEY",
    WANEX_PROVIDER_MODEL_ID: "installed-assistant-tui-model",
    WANEX_MODEL_OPERATIONS: "conversation",
    WANEX_MODEL_INPUT_MODALITIES: "text",
    WANEX_MODEL_OUTPUT_MODALITIES: "text",
    WANEX_INSTALLED_TUI_PROVIDER_KEY: provider.credential
  }
}

function tuiEnvironment(overrides) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      !name.startsWith("WANEX_MODEL_") &&
      !name.startsWith("WANEX_PROVIDER_") &&
      name !== "WANEX_STORE_DIR" &&
      name !== "WANEX_SYSTEM_SERVICE_BIN" &&
      name !== "WANEX_INSTALLED_TUI_PROVIDER_KEY"
    )
  )
  return { ...environment, ...overrides }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function cleanupInstalledTuiCredentials(options) {
  const namespace = createHash("sha256")
    .update("wanex.assistant.local.secret-store.v1\u0000")
    .update(resolve(options.storeDir))
    .digest("hex")
  const service = `com.wanex.assistant.${namespace}`
  const requireFromProject = createRequire(join(options.projectDir, "package.json"))
  const { Entry, findCredentials } = requireFromProject("@napi-rs/keyring")
  const credentials = findCredentials(service)
  const observed = credentials.map((credential) => credential.password).sort()
  const expected = [...options.expectedCredentials].sort()
  const valid = options.allowAny === true ||
    JSON.stringify(observed) === JSON.stringify(expected)
  for (const credential of credentials) {
    new Entry(service, credential.account).deleteCredential()
  }
  if (!valid) {
    throw new Error(
      `installed TUI keychain evidence differs: ` +
      `expected=${expected.length} observed=${credentials.length}`
    )
  }
  if (findCredentials(service).length !== 0) {
    throw new Error("installed TUI proof credential cleanup failed")
  }
  return { credentialCount: credentials.length }
}

function assertCommonTuiOutput(output, provider, paths) {
  if (!output.includes(`assistant:${provider.assistantText}`)) {
    throw new Error(`installed TUI output misses assistant response: ${output}`)
  }
  if (!output.includes("state:succeeded")) {
    throw new Error(`installed TUI output misses canonical settlement: ${output}`)
  }
  if (!provider.authorized) {
    throw new Error("installed TUI Provider did not receive exact Bearer credential")
  }
  assertTerminalPrivacy(output, provider, {
    ...paths,
    label: "installed TUI output"
  })
}

function assertTerminalPrivacy(output, provider, options) {
  const forbidden = [
    provider.credential,
    "job_",
    "attempt_",
    "secretRef",
    "secret_ref",
    "WANEX_PROVIDER_SECRET_REF",
    "env://WANEX_INSTALLED_TUI_PROVIDER_KEY",
    options.storeDir,
    options.projectDir,
    workspaceRoot
  ].filter((value) => value.length > 0)
  const leaked = forbidden.find((value) => output.includes(value))
  if (leaked !== undefined) {
    throw new Error(`${options.label} leaked forbidden value: ${leaked}`)
  }
}

async function assertFilesDoNotContain(root, forbidden, label) {
  const files = await listFilesForScan(root)
  for (const file of files) {
    const content = await readFile(file, "utf8")
    const leaked = forbidden.find((value) => content.includes(value))
    if (leaked !== undefined) {
      throw new Error(`${label} leaked forbidden value ${leaked} in ${file}`)
    }
  }
}

async function listFilesForScan(root) {
  const rootInformation = await stat(root).catch((error) => {
    if (error?.code === "ENOENT") return undefined
    throw error
  })
  if (rootInformation === undefined) return []
  if (rootInformation.isFile()) return [root]
  const information = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return []
    throw error
  })
  const files = []
  for (const entry of information) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await listFilesForScan(path))
    else files.push(path)
  }
  return files
}

function assertProviderRequest(provider, expectedInput) {
  const observed = provider.requests.some((request) =>
    providerBodyContainsInput(request.body, expectedInput)
  )
  if (!observed) {
    throw new Error(`installed TUI Provider missed user input: ${expectedInput}`)
  }
}

function assertExactProviderRequest(provider, expected) {
  const observed = provider.requests.some((request) =>
    request.authorization === `Bearer ${expected.credential}` &&
    request.body?.model === expected.modelId &&
    providerBodyContainsInput(request.body, expected.input)
  )
  if (!observed) {
    throw new Error(
      "installed TUI Provider missed exact lifecycle request: " +
      `${expected.input} / ${expected.modelId}`
    )
  }
}

function providerBodyContainsInput(body, expectedInput) {
  return Array.isArray(body?.messages) && body.messages.some((message) =>
    message?.role === "user" && (
      message.content === expectedInput ||
      (Array.isArray(message.content) && message.content.some((part) =>
        part?.type === "text" && part.text === expectedInput
      ))
    )
  )
}

function assertNoForbiddenValues(output, forbidden, label) {
  const leaked = forbidden.find((value) => output.includes(value))
  if (leaked !== undefined) {
    throw new Error(`${label} leaked a Provider credential`)
  }
}

function customProviderConnectionId(baseUrl) {
  const digest = createHash("sha256").update(baseUrl).digest("hex").slice(0, 16)
  return `openai-compatible-${digest}`
}

function collectChildOutput(child) {
  const output = { stdout: "", stderr: "" }
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => { output.stdout += chunk })
  child.stderr.on("data", (chunk) => { output.stderr += chunk })
  return output
}

function waitForOutput(output, child, needle, timeoutMs) {
  if (output.stdout.includes(needle)) return Promise.resolve()
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(
        `timed out waiting for output ${needle}: ${output.stdout}\n${output.stderr}`
      ))
    }, timeoutMs)
    const poll = setInterval(() => {
      if (output.stdout.includes(needle)) {
        cleanup()
        resolvePromise()
      }
    }, 25)
    const onExit = (code, signal) => {
      cleanup()
      reject(new Error(
        `process exited before output ${needle}: code=${String(code)} signal=${String(signal)}\n` +
        `${output.stdout}\n${output.stderr}`
      ))
    }
    child.once("exit", onExit)
    function cleanup() {
      clearTimeout(timer)
      clearInterval(poll)
      child.removeListener("exit", onExit)
    }
  })
}

function waitForChild(child, output, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`installed TUI process timed out: ${output.stdout}\n${output.stderr}`))
    }, timeoutMs)
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, signal, stdout: output.stdout, stderr: output.stderr })
    })
  })
}

async function assertNoProcessContaining(marker) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  const { stdout } = process.platform === "win32"
    ? await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine"
      ])
    : await execFileAsync("ps", ["-ax", "-o", "command="])
  if (stdout.includes(marker)) {
    throw new Error(`installed TUI left an owned process: ${marker}`)
  }
}

async function listRelativeFiles(root) {
  const entries = await readdirRecursive(root)
  return entries.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

async function readdirRecursive(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) result.push(...await readdirRecursive(root, path))
    else result.push(path)
  }
  return result
}

function closeServer(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => error === undefined ? resolvePromise() : reject(error))
  })
}
