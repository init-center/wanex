#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  distributionRoot,
  packageProductDesktop,
  packagedExecutable,
  productDesktopResourcesDir
} from "./build.mjs"
import {
  PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT,
  summarizeProductDesktopSamples
} from "./metrics.mjs"
import { listenProductDesktopProofProvider } from "./provider-fixture.mjs"
import { createProductDesktopPluginProofFixtures } from "./plugin-fixture.mjs"
import {
  writeProductDesktopFailureReport
} from "./proof/failure-report.mjs"
import {
  WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID,
  WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
  WANEX_DESKTOP_PROOF_GOAL_CRITERION,
  WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FINAL_VERIFICATION_REASON,
  WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FIRST_VERIFICATION_REASON,
  WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE,
  WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_PLAN_REQUEST,
  WANEX_DESKTOP_PROOF_PLAN_RESPONSE,
  WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE,
  WANEX_DESKTOP_PROOF_PLAN_SUMMARY,
  WANEX_DESKTOP_PROOF_PLAN_TITLE,
  WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE,
  WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS,
  WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS,
  WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT,
  WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESPONSE,
  WANEX_DESKTOP_PROOF_TEAM_MESSAGE,
  WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID
} from "../src/proof-contract.ts"

const PRODUCT_DESKTOP_PROOF_ENVIRONMENT_KEYS = [
  "WANEX_DESKTOP_PROOF_RECEIPT",
  "WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT",
  "WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT",
  "WANEX_DESKTOP_PROOF_USER_DATA",
  "WANEX_DESKTOP_PROOF_PROFILE_ID",
  "WANEX_DESKTOP_PROOF_STEP",
  "WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL",
  "WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL",
  "WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS"
]

if (import.meta.main) {
  assertCanonicalProofArgs(process.argv.slice(2))
  const receipt = await proveProductDesktop()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export function assertCanonicalProofArgs(args) {
  for (const arg of args) {
    if (arg !== "--") {
      throw new Error(`unknown Product Desktop proof argument: ${arg}`)
    }
  }
}

export async function proveProductDesktop() {
  const proofRoot = await mkdtemp(join(tmpdir(), "Wanex 桌面 证明-"))
  const userDataDir = join(proofRoot, "用户 数据")
  const proofCredential = `wanex-desktop-proof-${randomUUID()}`
  const provider = await listenProductDesktopProofProvider({
    credential: proofCredential
  })
  try {
    const buildReceipt = await packageProductDesktop()
    const executable = packagedExecutable(buildReceipt.packaged.packageDir)
    const immutableBefore = await hashImmutableResources(
      buildReceipt.packaged.packageDir
    )
    const pluginFixtures = await createProductDesktopPluginProofFixtures({
      root: join(proofRoot, "plugin-fixtures")
    })
    const samples = []
    let retainedScreenshot
    for (let index = 0; index < PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT; index += 1) {
      const receiptPath = join(proofRoot, `runtime-receipt-${index}.json`)
      const normalScreenshotPath = join(
        proofRoot,
        `product-desktop-normal-${index}.png`
      )
      const narrowScreenshotPath = join(
        proofRoot,
        `product-desktop-narrow-${index}.png`
      )
      const requestOffset = provider.requests.length
      const measured = await measureProductDesktopSample(
        () => run(executable, {
          WANEX_DESKTOP_PROOF_RECEIPT: receiptPath,
          WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT: normalScreenshotPath,
          WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT: narrowScreenshotPath,
          WANEX_DESKTOP_PROOF_USER_DATA: userDataDir,
          WANEX_DESKTOP_PROOF_PROFILE_ID: `proof-${index}`,
          WANEX_DESKTOP_PROOF_STEP: "lifecycle",
          WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL: provider.baseUrl,
          WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL: proofCredential
        }, 60_000, receiptPath),
        () => assertNoOwnedProcess(userDataDir)
      )
      const runtime = JSON.parse(await readFile(receiptPath, "utf8"))
      assertRuntimeReceipt(runtime)
      assertProviderFixtureRequests(provider.requests.slice(requestOffset))
      const normalScreenshot = await readFile(normalScreenshotPath)
      const narrowScreenshot = await readFile(narrowScreenshotPath)
      if (
        normalScreenshot.byteLength !== runtime.screenshots.normal.bytes ||
        narrowScreenshot.byteLength !== runtime.screenshots.narrow.bytes
      ) {
        throw new Error("Product Desktop screenshot receipt differs from files")
      }
      retainedScreenshot = { normal: normalScreenshot, narrow: narrowScreenshot }
      const failureEvidence =
        `${measured.output.stderr}\n${JSON.stringify(runtime)}`
      if (/EPERM[\s\S]{0,160}rename|rename[\s\S]{0,160}EPERM/i.test(failureEvidence)) {
        throw new Error("Product Desktop emitted an EPERM rename failure")
      }
      samples.push({
        index,
        temperature: index === 0 ? "cold" : "warm",
        runtime,
        wallTimeMs: measured.wallTimeMs
      })
    }
    const relaunch = await proveProductDesktopRelaunchJourneys({
      executable,
      proofRoot,
      userDataDir,
      provider,
      credential: proofCredential,
      plugins: pluginFixtures
    })
    const immutableAfter = await hashImmutableResources(
      buildReceipt.packaged.packageDir
    )
    if (JSON.stringify(immutableAfter) !== JSON.stringify(immutableBefore)) {
      throw new Error("packaged Product Desktop immutable resources changed")
    }
    if (retainedScreenshot === undefined) {
      throw new Error("Product Desktop proof did not capture a screenshot")
    }
    const normalScreenshotFile = "product-desktop-proof-normal.png"
    const narrowScreenshotFile = "product-desktop-proof-narrow.png"
    await writeFile(
      join(distributionRoot, normalScreenshotFile),
      retainedScreenshot.normal
    )
    await writeFile(
      join(distributionRoot, narrowScreenshotFile),
      retainedScreenshot.narrow
    )
    const receipt = {
      kind: "wanex.product-desktop.proof-receipt",
      ok: true,
      host: { platform: process.platform, arch: process.arch },
      pathCase: { spaces: true, nonAscii: true },
      staging: buildReceipt.staging,
      credential: buildReceipt.credential,
      packaged: {
        ...buildReceipt.packaged,
        packageDir: undefined
      },
      immutableResources: immutableAfter,
      screenshots: {
        normal: {
          file: normalScreenshotFile,
          bytes: retainedScreenshot.normal.byteLength,
          sha256: createHash("sha256")
            .update(retainedScreenshot.normal)
            .digest("hex")
        },
        narrow: {
          file: narrowScreenshotFile,
          bytes: retainedScreenshot.narrow.byteLength,
          sha256: createHash("sha256")
            .update(retainedScreenshot.narrow)
            .digest("hex")
        }
      },
      sampleCount: samples.length,
      samples,
      summary: summarizeProductDesktopSamples(samples),
      relaunch,
      schedule: relaunch.schedule,
      providerFixture: {
        requestCount: provider.requests.length,
        allAuthorized: provider.requests.every((request) => request.authorized),
        models: [...new Set(provider.requests.map((request) => request.model))]
          .sort()
      },
      realProductDocument: true,
      screenshotsNonBlank: true,
      noEpermRename: true,
      noOwnedProcessAfterRun: true
    }
    if (JSON.stringify(receipt).includes(proofCredential)) {
      throw new Error("Product Desktop proof receipt leaked the Provider credential")
    }
    await writeFile(
      join(distributionRoot, "product-desktop-report.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8"
    )
    return receipt
  } catch (error) {
    await writeProductDesktopFailureReport({ error, proofRoot })
    throw error
  } finally {
    await Promise.all([
      provider.close(),
      removeProductDesktopProofRoot(proofRoot)
    ])
  }
}

export async function removeProductDesktopProofRoot(root) {
  if (process.platform !== "win32") {
    await makeProofTreeOwnerWritable(root)
  }
  await rm(root, { recursive: true, force: true })
}

async function makeProofTreeOwnerWritable(path) {
  try {
    await chmod(path, 0o700)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  const entries = await readdir(path, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      await makeProofTreeOwnerWritable(child)
    } else if (entry.isFile()) {
      await chmod(child, 0o600)
    }
  }))
}

export async function proveProductDesktopRelaunchJourneys(options) {
  const profileId = "proof-relaunch"
  const steps = []
  let cleanupRequired = true
  let journeyFailure
  try {
    await runRelaunchStep("relaunch-configure", {
      WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL: options.provider.baseUrl,
      WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL: options.credential
    })
    await runRelaunchStep("relaunch-chat")
    await runRelaunchStep("relaunch-cancel-regenerate")
    await runRelaunchStep("relaunch-guided-follow-up")
    await runRelaunchStep("relaunch-side-query")
    await runRelaunchStep("relaunch-multimodal")
    await runRelaunchStep("relaunch-image-generation")
    await runRelaunchStep("relaunch-plan")
    await runRelaunchStep("relaunch-goal")
    await runRelaunchStep("relaunch-schedule-create")
    await runRelaunchStep("relaunch-schedule-restore")
    await runRelaunchStep("relaunch-team")
    await runRelaunchStep("relaunch-plugin-install", {
      WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS: JSON.stringify([
        options.plugins.v1.root,
        options.plugins.v1.root,
        options.plugins.v2.root
      ])
    })
    await runRelaunchStep("relaunch-plugin-restore")
    await runRelaunchStep("relaunch-cleanup")
    cleanupRequired = false
    await runRelaunchStep("relaunch-unconfigured")
  } catch (error) {
    journeyFailure = error
  }
  let cleanupFailure
  if (cleanupRequired) {
    try {
      await runRelaunchStep("relaunch-cleanup", {}, {
        record: false,
        allowAlreadyClean: true
      })
    } catch (error) {
      cleanupFailure = error
    }
  }
  if (journeyFailure !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError(
      [journeyFailure, cleanupFailure],
      "Product Desktop relaunch journey and cleanup both failed"
    )
  }
  if (journeyFailure !== undefined) throw journeyFailure
  if (cleanupFailure !== undefined) throw cleanupFailure
  return {
    kind: "wanex.product-desktop.relaunch-journeys-receipt",
    ok: true,
    processCount: steps.length,
    credentialPassedProcessCount: 1,
    sameProfile: true,
    chatRelaunchReceivedCredential: false,
    cancelRegenerateRelaunchReceivedCredential: false,
    guidedFollowUpRelaunchReceivedCredential: false,
    sideQueryRelaunchReceivedCredential: false,
    multimodalRelaunchReceivedCredential: false,
    imageGenerationRelaunchReceivedCredential: false,
    planRelaunchReceivedCredential: false,
    goalRelaunchReceivedCredential: false,
    scheduleCreateRelaunchReceivedCredential: false,
    scheduleRestoreRelaunchReceivedCredential: false,
    teamRelaunchReceivedCredential: false,
    pluginInstallRelaunchReceivedCredential: false,
    pluginRestoreRelaunchReceivedCredential: false,
    cleanupRelaunchReceivedCredential: false,
    finalRelaunchReceivedCredential: false,
    schedule: {
      intervalSeconds: WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS,
      heldForMs: WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS,
      crossedDeadlineCount: Math.floor(
        WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS /
          (WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS * 1_000)
      ),
      createProviderRequestCount: 1,
      restoreProviderRequestCount: 1,
      nonOverlapVerified: true,
      disabledQuietWindowVerified: true,
      sameProfileRestored: true,
      removed: true
    },
    steps
  }

  async function runRelaunchStep(step, extraEnvironment = {}, behavior = {}) {
    const receiptPath = join(options.proofRoot, `${step}-receipt.json`)
    const requestOffset = options.provider.requests.length
    const environment = {
      WANEX_DESKTOP_PROOF_RECEIPT: receiptPath,
      WANEX_DESKTOP_PROOF_USER_DATA: options.userDataDir,
      WANEX_DESKTOP_PROOF_PROFILE_ID: profileId,
      WANEX_DESKTOP_PROOF_STEP: step,
      ...extraEnvironment
    }
    if (
      step !== "relaunch-configure" &&
      Object.hasOwn(environment, "WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL")
    ) {
      throw new Error(`Product Desktop ${step} must not receive a credential`)
    }
    let measured
    let proofReleaseTriggered = false
    const releasesHeldProviderResponse =
      step === "relaunch-guided-follow-up" ||
      step === "relaunch-side-query" ||
      step === "relaunch-schedule-create"
    const onStdout = releasesHeldProviderResponse
      ? (stdout) => {
          const marker =
            step === "relaunch-guided-follow-up"
              ? WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER
              : step === "relaunch-side-query"
                ? WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER
                : WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER
          if (proofReleaseTriggered || !stdout.includes(marker)) return
          proofReleaseTriggered = true
          const released =
            step === "relaunch-guided-follow-up"
              ? options.provider.releaseGuidedFollowUpParent()
              : step === "relaunch-side-query"
                ? options.provider.releaseSideQueryParent()
                : options.provider.releaseSchedule()
          if (!released) {
            throw new Error(
              `Product Desktop ${step} parent release was not accepted`
            )
          }
        }
      : undefined
    try {
      measured = await measureProductDesktopSample(
        () =>
          run(
            options.executable,
            environment,
            step.startsWith("relaunch-schedule-") ? 90_000 : 60_000,
            receiptPath,
            { onStdout }
          ),
        () => assertNoOwnedProcess(options.userDataDir)
      )
    } catch (error) {
      const providerEvidence = options.provider.requests.slice(requestOffset)
      throw new Error(
        `Product Desktop ${step} process failed with Provider evidence ${JSON.stringify(providerEvidence)}`,
        { cause: error }
      )
    }
    const runtime = JSON.parse(await readFile(receiptPath, "utf8"))
    assertRelaunchJourneyRuntimeReceipt(runtime, step, {
      allowAlreadyClean: behavior.allowAlreadyClean === true
    })
    assertRelaunchJourneyFixtureRequests(
      options.provider.requests.slice(requestOffset),
      step
    )
    const evidence = {
      step,
      runtime,
      wallTimeMs: measured.wallTimeMs,
      receivedCredential:
        Object.hasOwn(environment, "WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL")
    }
    if (JSON.stringify(evidence).includes(options.credential)) {
      throw new Error(`Product Desktop ${step} receipt leaked the credential`)
    }
    if (behavior.record !== false) steps.push(evidence)
    return evidence
  }
}

export async function measureProductDesktopSample(
  runSample,
  auditOwnedProcesses,
  now = () => Date.now()
) {
  const startedAt = now()
  let output
  let runFailure
  try {
    output = await runSample()
  } catch (error) {
    runFailure = error
  }
  const wallTimeMs = now() - startedAt
  let auditFailure
  try {
    await auditOwnedProcesses()
  } catch (error) {
    auditFailure = error
  }
  if (runFailure !== undefined && auditFailure !== undefined) {
    throw new AggregateError(
      [runFailure, auditFailure],
      "Product Desktop execution and process audit both failed"
    )
  }
  if (runFailure !== undefined) throw runFailure
  if (auditFailure !== undefined) throw auditFailure
  return { output, wallTimeMs }
}

function assertRuntimeReceipt(runtime) {
  if (
    runtime?.kind !== "wanex.product-desktop.runtime-receipt" ||
    runtime.ok !== true ||
    runtime.proofStep !== "lifecycle" ||
    runtime.renderer?.ok !== true ||
    !Number.isSafeInteger(runtime.renderer?.initialLayout?.viewportWidth) ||
    runtime.renderer.initialLayout.viewportWidth < 760 ||
    !Number.isSafeInteger(runtime.renderer?.initialLayout?.viewportHeight) ||
    runtime.renderer.initialLayout.viewportHeight < 560 ||
    !Number.isFinite(runtime.renderer?.initialLayout?.shellBottom) ||
    runtime.renderer.initialLayout.shellBottom <= 0 ||
    runtime.renderer.initialLayout.shellBottom >
      runtime.renderer.initialLayout.viewportHeight ||
    !Number.isFinite(runtime.renderer?.initialLayout?.sidebarWidth) ||
    runtime.renderer.initialLayout.sidebarWidth < 180 ||
    runtime.renderer.initialLayout.sidebarWidth > 320 ||
    runtime.renderer?.initialLayout?.shellStartsAtViewportTop !== true ||
    runtime.renderer?.initialLayout?.shellFitsViewport !== true ||
    runtime.renderer?.initialLayout?.noHorizontalOverflow !== true ||
    runtime.renderer?.initialLayout?.settingsTriggerFullyVisible !== true ||
    runtime.renderer?.initialLayout?.settingsPanelInitiallyClosed !== true ||
    runtime.renderer?.initialLayout?.sidebarVisible !== true ||
    runtime.renderer?.initialLayout?.composerFullyVisible !== true ||
    !Number.isFinite(runtime.renderer?.initialLayout?.timelineHeight) ||
    runtime.renderer.initialLayout.timelineHeight < 120 ||
    !Number.isFinite(runtime.renderer?.initialLayout?.composerDockHeight) ||
    runtime.renderer.initialLayout.composerDockHeight <= 0 ||
    runtime.renderer.initialLayout.composerDockHeight > 320 ||
    !Number.isFinite(runtime.renderer?.initialLayout?.composerHeight) ||
    runtime.renderer.initialLayout.composerHeight <= 0 ||
    runtime.renderer.initialLayout.composerHeight > 160 ||
    runtime.renderer?.initialLayout?.initialScrollPolicyValid !== true ||
    runtime.renderer?.userVisible !== true ||
    runtime.renderer?.assistantVisible !== true ||
    runtime.renderer?.providerConfigured !== true ||
    runtime.renderer?.providerEditedWithoutCredential !== true ||
    runtime.renderer?.configuredProviderCount !== 2 ||
    runtime.renderer?.providerEvidenceRedacted !== true ||
    runtime.renderer?.activeProviderRemoved !== true ||
    runtime.renderer?.fallbackProviderReady !== true ||
    runtime.renderer?.fallbackModelId !== WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID ||
    runtime.renderer?.fallbackModelResponseVisible !== true ||
    runtime.renderer?.providerLifecycleWithoutRestart !== true ||
    runtime.renderer?.providerReady !== true ||
    runtime.renderer?.modelSelectorVisible !== true ||
    runtime.renderer?.modelSwitchAccepted !== true ||
    runtime.renderer?.draftPreservedAcrossModelSwitch !== true ||
    runtime.renderer?.selectedModelEndpointId?.length === 0 ||
    runtime.renderer?.selectedModelId !== WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID ||
    runtime.renderer?.selectedModelResponseVisible !== true ||
    runtime.renderer?.richHeadingVisible !== true ||
    runtime.renderer?.richCodeVisible !== true ||
    runtime.renderer?.selectedSessionTitle !== "Desktop product proof" ||
    runtime.renderer?.listedSessionTitle !== "Desktop product proof" ||
    runtime.renderer?.conversationIdentityIntegrity !== true ||
    runtime.renderer?.soleProductRenderer !== true ||
    runtime.renderer?.unknownRouteRejected !== true ||
    runtime.renderer?.sessionNavigationTruth !== true ||
    runtime.renderer?.canonicalTranscriptIntegrity !== true ||
    runtime.renderer?.conversationTimelineSemantics !== true ||
    runtime.renderer?.chatFirstInformationArchitecture !== true ||
    runtime.renderer?.conversationSpaceAllocation !== true ||
    runtime.renderer?.composerVisible !== true ||
    runtime.renderer?.latestAssistantVisible !== true ||
    runtime.renderer?.workflowsContextual !== true ||
    runtime.renderer?.composerControlsComplete !== true ||
    runtime.renderer?.commandPaletteContextual !== true ||
    runtime.renderer?.canonicalCommandPreviewed !== true ||
    runtime.renderer?.canonicalCommandExecuted !== true ||
    runtime.renderer?.commandCompletionVisible !== true ||
    runtime.renderer?.internalExecutionIdentitiesHidden !== true ||
    runtime.renderer?.developerControlsAbsent !== true ||
    runtime.renderer?.sessionId?.length === 0 ||
    runtime.visualAccessibility?.normal?.ok !== true ||
    runtime.visualAccessibility?.narrow?.ok !== true ||
    runtime.visualAccessibility.normal.viewportWidth < 1270 ||
    runtime.visualAccessibility.normal.viewportHeight < 700 ||
    runtime.visualAccessibility.normal.timelineLogSemantics !== true ||
    runtime.visualAccessibility.normal.completedMessagesUnframed !== true ||
    runtime.visualAccessibility.normal.productChromeBrandFree !== true ||
    runtime.visualAccessibility.normal.noHorizontalOverflow !== true ||
    runtime.visualAccessibility.normal.composerFullyVisible !== true ||
    runtime.visualAccessibility.normal.reducedMotionRuleShipped !== true ||
    runtime.visualAccessibility.normal.settingsOpenerFocused !== true ||
    runtime.visualAccessibility.normal.settingsDialogFocused !== true ||
    runtime.visualAccessibility.normal.settingsBackgroundInert !== true ||
    runtime.visualAccessibility.normal.settingsForwardTabContained !== true ||
    runtime.visualAccessibility.normal.settingsBackwardTabContained !== true ||
    runtime.visualAccessibility.normal.settingsClosedWithEscape !== true ||
    runtime.visualAccessibility.normal.settingsFocusRestored !== true ||
    runtime.visualAccessibility.narrow.viewportWidth !== 760 ||
    runtime.visualAccessibility.narrow.viewportHeight < 700 ||
    runtime.visualAccessibility.narrow.mobileNavigationVisible !== true ||
    runtime.visualAccessibility.narrow.sidebarInitiallyHidden !== true ||
    runtime.visualAccessibility.narrow.noHorizontalOverflow !== true ||
    runtime.visualAccessibility.narrow.composerFullyVisible !== true ||
    runtime.visualAccessibility.narrow.drawerDialogSemantics !== true ||
    runtime.visualAccessibility.narrow.drawerInitialFocusEntered !== true ||
    runtime.visualAccessibility.narrow.drawerBackgroundInert !== true ||
    runtime.visualAccessibility.narrow.drawerForwardTabContained !== true ||
    runtime.visualAccessibility.narrow.drawerBackwardTabContained !== true ||
    runtime.visualAccessibility.narrow.drawerClosedWithEscape !== true ||
    runtime.visualAccessibility.narrow.drawerFocusRestored !== true ||
    runtime.visualAccessibility.narrow.drawerReopenedForScreenshot !== true ||
    runtime.screenshots?.normal?.nonBlank !== true ||
    runtime.screenshots?.narrow?.nonBlank !== true ||
    runtime.screenshots?.normal?.contentWidth !== 1280 ||
    runtime.screenshots?.normal?.contentHeight !== 748 ||
    !validScreenshotScale(runtime.screenshots.normal) ||
    !Number.isSafeInteger(runtime.screenshots?.normal?.bytes) ||
    runtime.screenshots.normal.bytes <= 0 ||
    runtime.screenshots?.narrow?.contentWidth !== 760 ||
    runtime.screenshots?.narrow?.contentHeight !== 748 ||
    !validScreenshotScale(runtime.screenshots.narrow) ||
    !Number.isSafeInteger(runtime.screenshots?.narrow?.bytes) ||
    runtime.screenshots.narrow.bytes <= 0 ||
    runtime.privacy?.exposesStorePath !== false ||
    runtime.privacy?.exposesServiceBinaryPath !== false ||
    runtime.privacy?.exposesSecrets !== false ||
    runtime.privacy?.exposesRawStorageClient !== false ||
    runtime.privacy?.exposesElectronApi !== false
  ) {
    throw new Error(
      `Product Desktop runtime proof failed: ${JSON.stringify(runtime)}`
    )
  }
}

function validScreenshotScale(screenshot) {
  if (
    !Number.isSafeInteger(screenshot?.pixelWidth) ||
    !Number.isSafeInteger(screenshot?.pixelHeight) ||
    !Number.isFinite(screenshot?.scaleFactor) ||
    screenshot.scaleFactor < 1 ||
    screenshot.scaleFactor > 4
  ) {
    return false
  }
  const horizontal = screenshot.pixelWidth / screenshot.contentWidth
  const vertical = screenshot.pixelHeight / screenshot.contentHeight
  return Math.abs(horizontal - vertical) < 0.01 &&
    Math.abs(horizontal - screenshot.scaleFactor) < 0.01
}

function assertProviderFixtureRequests(requests) {
  const expectedModels = [
    WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID,
    WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID
  ]
  if (
    requests.length !== expectedModels.length ||
    requests.some((request) => request.authorized !== true) ||
    requests.some((request) => !request.path.endsWith("/chat/completions")) ||
    requests.some((request, index) => request.model !== expectedModels[index])
  ) {
    throw new Error(
      `Product Desktop proof provider requests are invalid: ${JSON.stringify(requests)}`
    )
  }
}

export function assertRelaunchJourneyFixtureRequests(requests, step) {
  if (step === "relaunch-schedule-create") {
    assertScheduleCreateFixtureRequests(requests)
    return
  }
  if (step === "relaunch-schedule-restore") {
    assertScheduleRestoreFixtureRequests(requests)
    return
  }
  if (step === "relaunch-side-query") {
    assertSideQueryFixtureRequests(requests)
    return
  }
  if (step === "relaunch-guided-follow-up") {
    assertGuidedFollowUpFixtureRequests(requests)
    return
  }
  if (step === "relaunch-image-generation") {
    assertImageGenerationFixtureRequests(requests)
    return
  }
  if (step === "relaunch-plan") {
    assertPlanFixtureRequests(requests)
    return
  }
  if (step === "relaunch-goal") {
    assertGoalFixtureRequests(requests)
    return
  }
  if (step === "relaunch-team") {
    assertTeamFixtureRequests(requests)
    return
  }
  if (step === "relaunch-cancel-regenerate") {
    assertCancelRegenerateFixtureRequests(requests)
    return
  }
  const expectedModels =
    step === "relaunch-configure" ||
    step === "relaunch-chat" ||
    step === "relaunch-multimodal"
    ? [WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID]
    : []
  if (
    requests.length !== expectedModels.length ||
    requests.some((request) => request.authorized !== true) ||
    requests.some((request) => !request.path.endsWith("/chat/completions")) ||
    requests.some((request, index) => request.model !== expectedModels[index]) ||
    requests.some((request) =>
      step === "relaunch-multimodal"
        ? request.imageInputCount !== 1 ||
          request.imageBytes <= 0 ||
          JSON.stringify(request.imageMediaTypes) !== JSON.stringify(["image/png"])
        : request.imageInputCount !== 0 ||
          request.imageBytes !== 0 ||
          request.imageMediaTypes.length !== 0
    )
  ) {
    throw new Error(
      `Product Desktop ${step} Provider requests are invalid: ${JSON.stringify(requests)}`
    )
  }
}

function assertScheduleCreateFixtureRequests(requests) {
  const [request] = requests
  const retained = JSON.stringify(requests)
  if (
    requests.length !== 1 ||
    request?.authorized !== true ||
    !request.path.endsWith("/chat/completions") ||
    request.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    request.imageInputCount !== 0 ||
    request.imageBytes !== 0 ||
    JSON.stringify(request.imageMediaTypes) !== JSON.stringify([]) ||
    request.schedulePhase !== "held" ||
    request.scheduleAttempt !== 1 ||
    request.scheduleReleaseReceived !== true ||
    request.scheduleSettled !== true ||
    request.scheduleClientClosed !== false ||
    retained.includes(WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT) ||
    retained.includes(WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_SCHEDULE_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop Schedule create Provider requests are invalid: ${retained}`
    )
  }
}

function assertScheduleRestoreFixtureRequests(requests) {
  const [request] = requests
  const retained = JSON.stringify(requests)
  if (
    requests.length !== 1 ||
    request?.authorized !== true ||
    !request.path.endsWith("/chat/completions") ||
    request.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    request.imageInputCount !== 0 ||
    request.imageBytes !== 0 ||
    JSON.stringify(request.imageMediaTypes) !== JSON.stringify([]) ||
    request.schedulePhase !== "restored" ||
    request.scheduleAttempt !== 2 ||
    retained.includes(WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT) ||
    retained.includes(WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop Schedule restore Provider requests are invalid: ${retained}`
    )
  }
}

function assertTeamFixtureRequests(requests) {
  const [request] = requests
  const retained = JSON.stringify(requests)
  if (
    requests.length !== 1 ||
    request?.authorized !== true ||
    !request.path.endsWith("/chat/completions") ||
    request.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    request.teamPhase !== "round" ||
    request.teamInputImageCount !== 0 ||
    request.teamInputImageBytes !== 0 ||
    request.imageInputCount !== 1 ||
    request.imageBytes !== 68 ||
    JSON.stringify(request.imageMediaTypes) !== JSON.stringify(["image/png"]) ||
    retained.includes(WANEX_DESKTOP_PROOF_TEAM_MESSAGE)
  ) {
    throw new Error(
      `Product Desktop Team Provider requests are invalid: ${retained}`
    )
  }
}

function assertSideQueryFixtureRequests(requests) {
  const [parent, query] = requests
  const retained = JSON.stringify(requests)
  const valid = requests.every((request) =>
    request.authorized === true &&
    request.path.endsWith("/chat/completions") &&
    request.model === WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID &&
    request.imageInputCount === 0 &&
    request.imageBytes === 0 &&
    JSON.stringify(request.imageMediaTypes) === JSON.stringify([])
  )
  if (
    requests.length !== 2 ||
    !valid ||
    parent?.sideQueryPhase !== "parent" ||
    parent.sideQueryReleaseReceived !== true ||
    parent.sideQueryParentSettled !== true ||
    parent.sideQueryParentClientClosed !== false ||
    query?.sideQueryPhase !== "query" ||
    query.sideQueryParentActiveAtRequest !== true ||
    query.sideQueryParentContextPresent !== true ||
    query.toolDefinitionCount !== 0 ||
    retained.includes(WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT) ||
    retained.includes(WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION) ||
    retained.includes(WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER) ||
    retained.includes(WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop Side Query Provider requests are invalid: ${retained}`
    )
  }
}

function assertGuidedFollowUpFixtureRequests(requests) {
  const [parent, child] = requests
  const retained = JSON.stringify(requests)
  const valid = requests.every((request) =>
    request.authorized === true &&
    request.path.endsWith("/chat/completions") &&
    request.model === WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID &&
    request.imageInputCount === 0 &&
    request.imageBytes === 0 &&
    JSON.stringify(request.imageMediaTypes) === JSON.stringify([])
  )
  if (
    requests.length !== 2 ||
    !valid ||
    parent?.guidedFollowUpPhase !== "parent" ||
    parent.guidedFollowUpReleaseReceived !== true ||
    parent.guidedFollowUpSettled !== true ||
    parent.guidedFollowUpClientClosed !== false ||
    child?.guidedFollowUpPhase !== "child" ||
    child.guidedFollowUpParentSettledBeforeRequest !== true ||
    retained.includes(WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT) ||
    retained.includes(WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT) ||
    retained.includes(WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop guided follow-up Provider requests are invalid: ${retained}`
    )
  }
}

function assertCancelRegenerateFixtureRequests(requests) {
  const [held, regenerated] = requests
  const retained = JSON.stringify(requests)
  const valid = requests.every((request) =>
    request.authorized === true &&
    request.path.endsWith("/chat/completions") &&
    request.model === WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID &&
    request.imageInputCount === 0 &&
    request.imageBytes === 0 &&
    JSON.stringify(request.imageMediaTypes) === JSON.stringify([])
  )
  if (
    requests.length !== 2 ||
    !valid ||
    held?.cancelRegeneratePhase !== "held" ||
    held.cancelRegenerateAttempt !== 1 ||
    held.cancelRegenerateClientClosed !== true ||
    regenerated?.cancelRegeneratePhase !== "regenerated" ||
    regenerated.cancelRegenerateAttempt !== 2 ||
    retained.includes(WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT) ||
    retained.includes(WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop cancel/regenerate Provider requests are invalid: ${retained}`
    )
  }
}

function assertImageGenerationFixtureRequests(requests) {
  const [toolCall, media, final] = requests
  const retained = JSON.stringify(requests)
  if (
    requests.length !== 3 ||
    toolCall?.authorized !== true ||
    !toolCall.path.endsWith("/chat/completions") ||
    toolCall.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    toolCall.imageGenerationPhase !== "tool_call" ||
    toolCall.imageInputCount !== 1 ||
    toolCall.imageBytes !== 68 ||
    JSON.stringify(toolCall.imageMediaTypes) !== JSON.stringify(["image/png"]) ||
    media?.authorized !== true ||
    !media.path.endsWith("/images/generations") ||
    media.model !== WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID ||
    media.imageGenerationPhase !== "media" ||
    media.generatedImageCount !== 1 ||
    media.generatedImageBytes <= 0 ||
    JSON.stringify(media.generatedImageMediaTypes) !== JSON.stringify(["image/png"]) ||
    final?.authorized !== true ||
    !final.path.endsWith("/chat/completions") ||
    final.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    final.imageGenerationPhase !== "final" ||
    final.imageInputCount !== 1 ||
    final.imageBytes !== 68 ||
    JSON.stringify(final.imageMediaTypes) !== JSON.stringify(["image/png"]) ||
    retained.includes(WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT) ||
    retained.includes(WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT) ||
    retained.includes("b64_json") ||
    retained.includes("data:image/")
  ) {
    throw new Error(
      `Product Desktop image generation Provider requests are invalid: ${retained}`
    )
  }
}

function assertPlanFixtureRequests(requests) {
  const [generation, execution] = requests
  const retained = JSON.stringify(requests)
  if (
    requests.length !== 2 ||
    generation?.authorized !== true ||
    !generation.path.endsWith("/chat/completions") ||
    generation.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    generation.planPhase !== "generation" ||
    generation.imageInputCount !== 1 ||
    generation.imageBytes !== 68 ||
    JSON.stringify(generation.imageMediaTypes) !== JSON.stringify(["image/png"]) ||
    execution?.authorized !== true ||
    !execution.path.endsWith("/chat/completions") ||
    execution.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
    execution.planPhase !== "execution" ||
    execution.imageInputCount !== 1 ||
    execution.imageBytes !== 68 ||
    JSON.stringify(execution.imageMediaTypes) !== JSON.stringify(["image/png"]) ||
    retained.includes(WANEX_DESKTOP_PROOF_PLAN_REQUEST) ||
    retained.includes(WANEX_DESKTOP_PROOF_PLAN_TITLE) ||
    retained.includes(WANEX_DESKTOP_PROOF_PLAN_SUMMARY) ||
    retained.includes(WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE) ||
    retained.includes(WANEX_DESKTOP_PROOF_PLAN_RESPONSE)
  ) {
    throw new Error(
      `Product Desktop Plan Provider requests are invalid: ${retained}`
    )
  }
}

function assertGoalFixtureRequests(requests) {
  const [firstExecution, firstVerifier, secondExecution, secondVerifier] = requests
  const retained = JSON.stringify(requests)
  const commonValid = requests.every((request) =>
    request.authorized === true &&
    request.path.endsWith("/chat/completions") &&
    request.model === WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID &&
    JSON.stringify(request.imageMediaTypes) ===
      JSON.stringify(request.goalPhase === "execution" ? ["image/png"] : []) &&
    request.imageBytes === (request.goalPhase === "execution" ? 68 : 0) &&
    request.imageInputCount === (request.goalPhase === "execution" ? 1 : 0)
  )
  if (
    requests.length !== 4 ||
    !commonValid ||
    firstExecution?.goalPhase !== "execution" ||
    firstExecution.goalAttempt !== 1 ||
    firstVerifier?.goalPhase !== "verifier" ||
    firstVerifier.goalAttempt !== 1 ||
    secondExecution?.goalPhase !== "execution" ||
    secondExecution.goalAttempt !== 2 ||
    secondVerifier?.goalPhase !== "verifier" ||
    secondVerifier.goalAttempt !== 2 ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE) ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_CRITERION) ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE) ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_FIRST_VERIFICATION_REASON) ||
    retained.includes(WANEX_DESKTOP_PROOF_GOAL_FINAL_VERIFICATION_REASON)
  ) {
    throw new Error(
      `Product Desktop Goal Provider requests are invalid: ${retained}`
    )
  }
}

export function assertRelaunchJourneyRuntimeReceipt(runtime, step, options = {}) {
  const renderer = runtime?.renderer
  const commonInvalid =
    runtime?.kind !== "wanex.product-desktop.runtime-receipt" ||
    runtime.ok !== true ||
    runtime.proofStep !== step ||
    renderer?.ok !== true ||
    renderer?.step !== step ||
    renderer?.providerEvidenceRedacted !== true ||
    runtime.privacy?.exposesStorePath !== false ||
    runtime.privacy?.exposesServiceBinaryPath !== false ||
    runtime.privacy?.exposesSecrets !== false ||
    runtime.privacy?.exposesRawStorageClient !== false ||
    runtime.privacy?.exposesElectronApi !== false
  if (commonInvalid) {
    throw new Error(
      `Product Desktop ${step} runtime proof failed: ${JSON.stringify(runtime)}`
    )
  }
  let stepInvalid = false
  if (step === "relaunch-configure") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 0 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.imageGenerationEndpointReady !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.initialTranscriptVisible !== true ||
      renderer.initialResponseVisible !== true ||
      renderer.conversationSubmitted !== true
  } else if (step === "relaunch-chat") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.initialTranscriptVisible !== true ||
      renderer.initialResponseVisible !== true ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.followUpSessionPreserved !== true ||
      renderer.followUpResponseVisible !== true
  } else if (step === "relaunch-cancel-regenerate") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.cancellationSubmitted !== true ||
      renderer.cancellationSucceeded !== true ||
      renderer.cancellationSessionPreserved !== true ||
      renderer.cancelledUserVisible !== true ||
      renderer.cancelledAssistantAbsent !== true ||
      renderer.regenerationSubmitted !== true ||
      renderer.regenerationFreshOperation !== true ||
      renderer.regenerationSucceeded !== true ||
      renderer.regenerationSessionPreserved !== true ||
      renderer.regenerationResponseVisible !== true
  } else if (step === "relaunch-guided-follow-up") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.guidedParentSubmitted !== true ||
      renderer.guidedParentPartialVisible !== true ||
      renderer.guidedComposerModeVisible !== true ||
      renderer.guidedFollowUpSubmitted !== true ||
      renderer.guidedDraftClearedAfterAcceptance !== true ||
      renderer.guidedPendingVisible !== true ||
      renderer.guidedParentOperationPreserved !== true ||
      renderer.guidedParentResponseVisible !== true ||
      renderer.guidedChildFreshOperation !== true ||
      renderer.guidedChildPromoted !== true ||
      renderer.guidedChildResponseVisible !== true ||
      renderer.guidedFollowUpSessionPreserved !== true ||
      renderer.guidedParentCompletedWithoutCancellation !== true
  } else if (step === "relaunch-side-query") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.sideQueryParentSubmitted !== true ||
      renderer.sideQueryParentPartialVisible !== true ||
      renderer.sideQueryDisclosureVisible !== true ||
      renderer.sideQuerySubmitted !== true ||
      renderer.sideQueryAnswerVisible !== true ||
      renderer.sideQueryParentOperationPreserved !== true ||
      renderer.sideQueryTranscriptUnchanged !== true ||
      renderer.sideQueryDismissed !== true ||
      renderer.sideQueryParentResponseVisible !== true ||
      renderer.sideQuerySessionPreserved !== true ||
      renderer.sideQueryParentCompletedWithoutCancellation !== true
  } else if (step === "relaunch-multimodal") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.attachmentPickerVisible !== true ||
      renderer.unsupportedAttachmentRejected !== true ||
      renderer.unsupportedDraftPreserved !== true ||
      renderer.attachmentPreviewVisible !== true ||
      renderer.attachmentRemoved !== true ||
      renderer.attachmentReadded !== true ||
      renderer.attachmentPasted !== true ||
      renderer.attachmentDropped !== true ||
      renderer.multimodalConversationSubmitted !== true ||
      renderer.multimodalResourceVisible !== true ||
      renderer.multimodalCanonicalPreviewVisible !== true ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true
  } else if (step === "relaunch-image-generation") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.imageGenerationEndpointReady !== true ||
      renderer.imageGenerationConversationSubmitted !== true ||
      renderer.imageGenerationSessionPreserved !== true ||
      renderer.imageGenerationToolSucceeded !== true ||
      renderer.generatedResourceEvidenceValid !== true ||
      renderer.generatedResourcePreviewVisible !== true
  } else if (step === "relaunch-plan") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.planGenerated !== true ||
      renderer.planOpenBeforeApproval !== true ||
      renderer.planExecutionAbsentBeforeApproval !== true ||
      renderer.planApproved !== true ||
      renderer.planExecuted !== true ||
      renderer.planSessionPreserved !== true ||
      renderer.planResponseVisible !== true ||
      renderer.planProposalRevision !== 2
  } else if (step === "relaunch-goal") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 1 ||
      renderer.configuredProviderCount !== 1 ||
      renderer.providerConfigured !== true ||
      renderer.providerReady !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.modelId !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID ||
      typeof renderer.sessionId !== "string" ||
      renderer.sessionId.length === 0 ||
      renderer.conversationSubmitted !== true ||
      renderer.userVisible !== true ||
      renderer.assistantVisible !== true ||
      renderer.responseVisible !== true ||
      renderer.goalStarted !== true ||
      renderer.goalAutonomousContinuation !== true ||
      renderer.goalSucceeded !== true ||
      renderer.goalSessionPreserved !== true ||
      renderer.goalFinalResponseVisible !== true ||
      renderer.goalAttemptCount !== 2 ||
      JSON.stringify(renderer.goalVerificationResults) !==
        JSON.stringify(["failed", "passed"])
  } else if (step === "relaunch-team") {
    const expectedKeys = [
      "activeRoundObserved",
      "automaticTerminalRefresh",
      "contextAutoOpened",
      "contextVisible",
      "coordinatedModeDefault",
      "coordinatorAssigned",
      "coordinatorMemberGuards",
      "coordinatorRequired",
      "deliveryReplied",
      "existingAgentSessionAvailable",
      "groupCreated",
      "groupSelected",
      "groupTitleVisible",
      "hostPathEvidenceHidden",
      "internalIdentityEvidenceHidden",
      "ok",
      "originalSessionRestored",
      "participantAdded",
      "participantCount",
      "participantNameVisible",
      "providerEvidenceRedacted",
      "providerReady",
      "publicAgentReplyVisible",
      "roundCompleted",
      "roundSubmitted",
      "sessionOnlyComposerAbsent",
      "sessionOnlyControlsAbsent",
      "singleCoordinatorDelivery",
      "singlePublicCoordinatorReply",
      "step",
      "teamComposerVisible",
      "teamTimelineVisible",
      "timingsMs",
      "zeroAgentStateTruthful"
    ]
    const timingKeys = [
      "conversationSettlement",
      "rendererInteractive",
      "rendererPostSettlement"
    ]
    stepInvalid =
      JSON.stringify(Object.keys(renderer).sort()) !== JSON.stringify(expectedKeys) ||
      JSON.stringify(Object.keys(renderer.timingsMs ?? {}).sort()) !==
        JSON.stringify(timingKeys) ||
      Object.values(renderer.timingsMs ?? {}).some((value) =>
        !Number.isFinite(value) || value < 0
      ) ||
      renderer.providerReady !== true ||
      renderer.existingAgentSessionAvailable !== true ||
      renderer.groupCreated !== true ||
      renderer.groupSelected !== true ||
      renderer.groupTitleVisible !== true ||
      renderer.coordinatedModeDefault !== true ||
      renderer.zeroAgentStateTruthful !== true ||
      renderer.coordinatorRequired !== true ||
      renderer.coordinatorAssigned !== true ||
      renderer.coordinatorMemberGuards !== true ||
      renderer.contextAutoOpened !== true ||
      renderer.teamTimelineVisible !== true ||
      renderer.teamComposerVisible !== true ||
      renderer.contextVisible !== true ||
      renderer.participantAdded !== true ||
      renderer.participantCount !== 1 ||
      renderer.participantNameVisible !== true ||
      renderer.providerEvidenceRedacted !== true ||
      renderer.roundSubmitted !== true ||
      renderer.activeRoundObserved !== true ||
      renderer.automaticTerminalRefresh !== true ||
      renderer.roundCompleted !== true ||
      renderer.deliveryReplied !== true ||
      renderer.singleCoordinatorDelivery !== true ||
      renderer.publicAgentReplyVisible !== true ||
      renderer.singlePublicCoordinatorReply !== true ||
      renderer.sessionOnlyComposerAbsent !== true ||
      renderer.sessionOnlyControlsAbsent !== true ||
      renderer.internalIdentityEvidenceHidden !== true ||
      renderer.hostPathEvidenceHidden !== true ||
      renderer.originalSessionRestored !== true
  } else if (step === "relaunch-schedule-create") {
    const expectedKeys = [
      "activeModelSelected",
      "disabledBeforeShutdown",
      "disabledQuietWindowObserved",
      "enabledAtCreation",
      "firstFinalResponseVisible",
      "firstPartialResponseVisible",
      "firstUserVisible",
      "internalIdentityEvidenceHidden",
      "intervalSeconds",
      "isolatedSessionSelected",
      "ok",
      "providerEvidenceRedacted",
      "providerReady",
      "scheduleCreated",
      "scheduleSessionVisible",
      "skipMisfireSelected",
      "step",
      "timingsMs",
      "visibleFormCreated"
    ]
    stepInvalid =
      !exactRendererShape(renderer, expectedKeys) ||
      renderer.providerReady !== true ||
      renderer.intervalSeconds !== WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS ||
      renderer.visibleFormCreated !== true ||
      renderer.isolatedSessionSelected !== true ||
      renderer.activeModelSelected !== true ||
      renderer.skipMisfireSelected !== true ||
      renderer.enabledAtCreation !== true ||
      renderer.scheduleCreated !== true ||
      renderer.scheduleSessionVisible !== true ||
      renderer.firstUserVisible !== true ||
      renderer.firstPartialResponseVisible !== true ||
      renderer.firstFinalResponseVisible !== true ||
      renderer.disabledBeforeShutdown !== true ||
      renderer.disabledQuietWindowObserved !== true ||
      renderer.internalIdentityEvidenceHidden !== true
  } else if (step === "relaunch-schedule-restore") {
    const expectedKeys = [
      "canonicalRemovedStateVisible",
      "disabledAfterExecution",
      "disabledQuietWindowObserved",
      "internalIdentityEvidenceHidden",
      "intervalSeconds",
      "ok",
      "persistedTranscriptVisible",
      "providerEvidenceRedacted",
      "providerReady",
      "reenabled",
      "removed",
      "restoredDefinitionVisible",
      "restoredDisabledState",
      "restoredExecutionResponseVisible",
      "restoredExecutionUserVisible",
      "step",
      "timingsMs"
    ]
    stepInvalid =
      !exactRendererShape(renderer, expectedKeys) ||
      renderer.providerReady !== true ||
      renderer.intervalSeconds !== WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS ||
      renderer.restoredDefinitionVisible !== true ||
      renderer.restoredDisabledState !== true ||
      renderer.persistedTranscriptVisible !== true ||
      renderer.reenabled !== true ||
      renderer.restoredExecutionUserVisible !== true ||
      renderer.restoredExecutionResponseVisible !== true ||
      renderer.disabledAfterExecution !== true ||
      renderer.disabledQuietWindowObserved !== true ||
      renderer.removed !== true ||
      renderer.canonicalRemovedStateVisible !== true ||
      renderer.internalIdentityEvidenceHidden !== true
  } else if (step === "relaunch-plugin-install") {
    const expectedKeys = [
      "attentionDiagnosticVisible",
      "attentionVisible",
      "cancelReviewEvidenceVisible",
      "cancelledReviewNotInstalled",
      "commandAbsentWhileDisabled",
      "commandId",
      "commandReturnedAfterEnable",
      "initialEmptyStateVisible",
      "internalIdentityEvidenceHidden",
      "ok",
      "pathEvidenceHidden",
      "pluginId",
      "providerEvidenceRedacted",
      "retryAvailable",
      "retryRecovered",
      "reviewCancelled",
      "singleActiveVersion",
      "step",
      "timingsMs",
      "v1CommandAvailable",
      "v1CommandExecuted",
      "v1Disabled",
      "v1DisabledAfterReplacement",
      "v1Enabled",
      "v1Installed",
      "v1Version",
      "v2CommandExecuted",
      "v2Installed",
      "v2ReviewEvidenceVisible",
      "v2Version"
    ]
    stepInvalid =
      !exactRendererShape(renderer, expectedKeys) ||
      !validPluginIdentity(renderer) ||
      renderer.initialEmptyStateVisible !== true ||
      renderer.cancelReviewEvidenceVisible !== true ||
      renderer.reviewCancelled !== true ||
      renderer.cancelledReviewNotInstalled !== true ||
      renderer.v1Installed !== true ||
      renderer.v1CommandAvailable !== true ||
      renderer.v1CommandExecuted !== true ||
      renderer.v1Disabled !== true ||
      renderer.commandAbsentWhileDisabled !== true ||
      renderer.v1Enabled !== true ||
      renderer.commandReturnedAfterEnable !== true ||
      renderer.v2ReviewEvidenceVisible !== true ||
      renderer.attentionVisible !== true ||
      renderer.attentionDiagnosticVisible !== true ||
      renderer.retryAvailable !== true ||
      renderer.retryRecovered !== true ||
      renderer.v2Installed !== true ||
      renderer.v1DisabledAfterReplacement !== true ||
      renderer.singleActiveVersion !== true ||
      renderer.v2CommandExecuted !== true ||
      renderer.pathEvidenceHidden !== true ||
      renderer.internalIdentityEvidenceHidden !== true
  } else if (step === "relaunch-plugin-restore") {
    const expectedKeys = [
      "busyTransientAbsent",
      "canonicalRemovedStateVisible",
      "commandAbsentAfterRemoval",
      "commandId",
      "commandRestored",
      "internalIdentityEvidenceHidden",
      "ok",
      "pathEvidenceHidden",
      "pluginId",
      "providerEvidenceRedacted",
      "restoredCommandExecuted",
      "reviewTransientAbsent",
      "singleActiveVersionRestored",
      "step",
      "timingsMs",
      "v1DisabledRestored",
      "v1Removed",
      "v1Version",
      "v2InstalledRestored",
      "v2Removed",
      "v2Version"
    ]
    stepInvalid =
      !exactRendererShape(renderer, expectedKeys) ||
      !validPluginIdentity(renderer) ||
      renderer.reviewTransientAbsent !== true ||
      renderer.busyTransientAbsent !== true ||
      renderer.v1DisabledRestored !== true ||
      renderer.v2InstalledRestored !== true ||
      renderer.singleActiveVersionRestored !== true ||
      renderer.commandRestored !== true ||
      renderer.restoredCommandExecuted !== true ||
      renderer.v2Removed !== true ||
      renderer.v1Removed !== true ||
      renderer.canonicalRemovedStateVisible !== true ||
      renderer.commandAbsentAfterRemoval !== true ||
      renderer.pathEvidenceHidden !== true ||
      renderer.internalIdentityEvidenceHidden !== true
  } else if (step === "relaunch-cleanup") {
    stepInvalid =
      (options.allowAlreadyClean === true
        ? ![0, 1].includes(renderer.initialConfiguredProviderCount)
        : renderer.initialConfiguredProviderCount !== 1) ||
      renderer.configuredProviderCount !== 0 ||
      renderer.cleanupCompleted !== true ||
      renderer.credentialCleanupPending !== false ||
      renderer.chatBlocked !== true
  } else if (step === "relaunch-unconfigured") {
    stepInvalid =
      renderer.initialConfiguredProviderCount !== 0 ||
      renderer.configuredProviderCount !== 0 ||
      renderer.chatBlocked !== true
  } else {
    stepInvalid = true
  }
  if (stepInvalid) {
    throw new Error(
      `Product Desktop ${step} runtime proof failed: ${JSON.stringify(runtime)}`
    )
  }
}

function exactRendererShape(renderer, expectedKeys) {
  const timingKeys = [
    "conversationSettlement",
    "rendererInteractive",
    "rendererPostSettlement"
  ]
  return JSON.stringify(Object.keys(renderer).sort()) ===
      JSON.stringify(expectedKeys) &&
    JSON.stringify(Object.keys(renderer.timingsMs ?? {}).sort()) ===
      JSON.stringify(timingKeys) &&
    Object.values(renderer.timingsMs ?? {}).every((value) =>
      Number.isFinite(value) && value >= 0
    )
}

function validPluginIdentity(renderer) {
  return renderer.pluginId === "wanex.proof.extension" &&
    renderer.commandId === "wanex.proof.extension.echo" &&
    renderer.v1Version === "1.0.0" &&
    renderer.v2Version === "2.0.0"
}

async function hashImmutableResources(packageDir) {
  const resourcesDir = productDesktopResourcesDir(packageDir)
  const nativeDir = join(resourcesDir, "native")
  const credentialDir = join(resourcesDir, "credentials")
  const nativeManifest = JSON.parse(await readFile(
    join(nativeDir, "runtime-artifacts.json"),
    "utf8"
  ))
  const target = nativeManifest.targets.find((item) =>
    item.platform === process.platform && item.arch === process.arch
  )
  if (target === undefined) {
    throw new Error("packaged Product Desktop native target is missing")
  }
  return {
    nativeManifestSha256: await sha256(
      join(nativeDir, "runtime-artifacts.json")
    ),
    systemServiceSha256: await sha256(join(
      nativeDir,
      ...target.systemService.path.split("/")
    )),
    credentialManifestSha256: await sha256(join(
      credentialDir,
      "desktop-credential-artifact.json"
    )),
    keyringSha256: await sha256(join(credentialDir, "keyring.node"))
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

function run(command, environment, timeoutMs, receiptPath, behavior = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(command, [], {
      env: createProductDesktopProofProcessEnvironment(
        process.env,
        environment
      ),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk)
      if (settled || behavior.onStdout === undefined) return
      try {
        behavior.onStdout(stdout)
      } catch (error) {
        settled = true
        clearTimeout(timeout)
        void terminateProcessTree(child).finally(() => reject(error))
      }
    })
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk)
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void terminateProcessTree(child).finally(() => {
        reject(new Error(
          `packaged Product Desktop exceeded ${timeoutMs}ms${formatChildOutput(stdout, stderr)}`
        ))
      })
    }, timeoutMs)
    child.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", async (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code === 0) resolve({ stdout, stderr })
      else {
        const runtimeReceipt = await readOptionalReceipt(receiptPath)
        reject(new Error(
          `packaged Product Desktop exited with ${signal ?? code}${formatChildOutput(stdout, stderr, runtimeReceipt)}`
        ))
      }
    })
  })
}

export function createProductDesktopProofProcessEnvironment(
  inheritedEnvironment,
  proofEnvironment
) {
  const environment = { ...inheritedEnvironment }
  for (const key of PRODUCT_DESKTOP_PROOF_ENVIRONMENT_KEYS) {
    delete environment[key]
  }
  return { ...environment, ...proofEnvironment }
}

async function readOptionalReceipt(path) {
  if (path === undefined) return ""
  try {
    return (await readFile(path, "utf8")).trim()
  } catch {
    return ""
  }
}

async function assertNoOwnedProcess(userDataDir) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  const commands = process.platform === "win32"
    ? await commandOutput("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine"
      ])
    : await commandOutput("ps", ["-ax", "-o", "command="])
  if (commands.includes(userDataDir)) {
    throw new Error("Product Desktop left an owned process after shutdown")
  }
}

function commandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      output = appendBounded(output, chunk)
    })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${command} process audit exited with ${code}`))
    })
  })
}

function terminateProcessTree(child) {
  if (child.pid === undefined) return Promise.resolve()
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch (error) {
      if (error.code !== "ESRCH") return Promise.reject(error)
    }
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const cleanup = spawn("taskkill", [
      "/PID",
      String(child.pid),
      "/T",
      "/F"
    ], {
      windowsHide: true,
      stdio: "ignore"
    })
    cleanup.once("error", () => resolve())
    cleanup.once("exit", () => resolve())
  })
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-1024 * 1024)
}

function formatChildOutput(stdout, stderr, runtimeReceipt = "") {
  const details = [
    stdout.trim().length === 0 ? undefined : `stdout:\n${stdout.trim()}`,
    stderr.trim().length === 0 ? undefined : `stderr:\n${stderr.trim()}`,
    runtimeReceipt.length === 0
      ? undefined
      : `runtime receipt:\n${runtimeReceipt}`
  ].filter(Boolean)
  return details.length === 0 ? "" : `\n${details.join("\n")}`
}
