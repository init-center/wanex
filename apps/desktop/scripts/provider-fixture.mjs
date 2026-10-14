import { createServer } from "node:http"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { GeminiAdapter } from "@wanex/runtime/provider"
import {
  WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
  WANEX_DESKTOP_PROOF_IMAGE_EDIT_PROMPT,
  WANEX_DESKTOP_PROOF_IMAGE_EDIT_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_EDIT_TEXT,
  WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_DESCRIPTION,
  WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_TEXT,
  WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT,
  WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FINAL_VERIFICATION_REASON,
  WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FIRST_VERIFICATION_REASON,
  WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE,
  WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_PLAN_REQUEST,
  WANEX_DESKTOP_PROOF_PLAN_RESPONSE,
  WANEX_DESKTOP_PROOF_PLAN_STEP_ID,
  WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE,
  WANEX_DESKTOP_PROOF_PLAN_SUMMARY,
  WANEX_DESKTOP_PROOF_PLAN_TITLE,
  WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT,
  WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MESSAGE,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_REMOTE_MULTIMODAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION,
  WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE,
  WANEX_DESKTOP_PROOF_TEAM_MESSAGE,
} from "../src/proof-contract.ts"

const MAX_REQUEST_BYTES = 1024 * 1024
const IMAGE_GENERATION_TOOL_CALL_ID = "call_desktop_proof_image_generate"
const IMAGE_EDIT_TOOL_CALL_ID = "call_desktop_proof_image_reference"
const GENERATED_IMAGE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

export async function listenDesktopProofProvider(options) {
  const requests = []
  const responses = []
  let cancelRegenerateRequestCount = 0
  let guidedParentObserved = false
  let guidedChildObserved = false
  let guidedParent
  let guidedParentEvidence
  let sideQueryParentObserved = false
  let sideQueryObserved = false
  let sideQueryParent
  let scheduleRequestCount = 0
  let scheduleParent
  let remoteAssistantObserved = false
  let remoteAssistantParent
  const server = createServer(async (request, response) => {
    try {
      const path = request.url ?? ""
      const rawBody = await readRequestBody(request)
      if (path.endsWith("/images/edits")) {
        await handleImageReferenceRequest(request, response, path, rawBody)
        return
      }
      const body = JSON.parse(rawBody.toString("utf8"))
      const model =
        typeof body?.model === "string" && body.model.length > 0
          ? body.model
          : "unknown-model"
      const authorized =
        request.headers.authorization === `Bearer ${options.credential}`
      if (path.endsWith("/images/generations")) {
        if (
          model !== WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID ||
          body?.prompt !== WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT
        ) {
          throw new Error("Desktop proof image generation request is invalid")
        }
        const requestEvidence = {
          path,
          model,
          authorized,
          imageGenerationPhase: "media",
          generatedImageCount: 1,
          generatedImageMediaTypes: ["image/png"],
          generatedImageBytes: GENERATED_IMAGE_BYTES.byteLength
        }
        requests.push(requestEvidence)
        observeProviderResponse(responses, response, { path, model })
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify({
          data: [{ b64_json: GENERATED_IMAGE_BYTES.toString("base64") }]
        }))
        return
      }
      const images = inspectImageInputs(body)
      const imageGenerationPhase = readImageGenerationPhase(body)
      const goal = readGoalPhase(body)
      const planPhase = readPlanPhase(body)
      const cancelRegenerate = readCancelRegeneratePhase(body)
      const guidedFollowUpPhase = readGuidedFollowUpPhase(body)
      const sideQueryPhase = readSideQueryProofPhase(body)
      const teamPhase = readTeamProofPhase(body)
      const scheduleProof = readScheduleProof(body)
      const remoteAssistantProof = readRemoteAssistantProof(body)
      const mediaRoutingPhase = readMediaRoutingPhase(body)
      const teamInputImages = teamPhase === undefined
        ? []
        : inspectLatestUserImageInputs(body)
      if (cancelRegenerate) cancelRegenerateRequestCount += 1
      if (scheduleProof) scheduleRequestCount += 1
      const requestEvidence = {
        path,
        model,
        authorized,
        imageInputCount: images.length,
        imageMediaTypes: [...new Set(images.map((image) => image.mediaType))]
          .sort(),
        imageBytes: images.reduce((total, image) => total + image.sizeBytes, 0),
        ...(imageGenerationPhase === undefined
          ? {}
          : { imageGenerationPhase }),
        ...(goal === undefined
          ? {}
          : { goalPhase: goal.phase, goalAttempt: goal.attempt }),
        ...(planPhase === undefined ? {} : { planPhase }),
        ...(cancelRegenerate
          ? {
              cancelRegeneratePhase:
                cancelRegenerateRequestCount === 1 ? "held" : "regenerated",
              cancelRegenerateAttempt: cancelRegenerateRequestCount,
              ...(cancelRegenerateRequestCount === 1
                ? { cancelRegenerateClientClosed: false }
                : {})
            }
          : {}),
        ...(guidedFollowUpPhase === undefined
          ? {}
          : guidedFollowUpPhase === "parent"
            ? {
                guidedFollowUpPhase,
                guidedFollowUpReleaseReceived: false,
                guidedFollowUpSettled: false,
                guidedFollowUpClientClosed: false
              }
            : {
                guidedFollowUpPhase,
                guidedFollowUpParentSettledBeforeRequest:
                  guidedParentEvidence?.guidedFollowUpSettled === true
              }),
        ...(sideQueryPhase === undefined
          ? {}
          : sideQueryPhase === "parent"
            ? {
                sideQueryPhase,
                sideQueryReleaseReceived: false,
                sideQueryParentSettled: false,
                sideQueryParentClientClosed: false
              }
            : {
                sideQueryPhase,
                sideQueryParentActiveAtRequest:
                  sideQueryParent !== undefined && !sideQueryParent.released,
                sideQueryParentContextPresent: body.messages.some((message) =>
                  messageText(message) === WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT
                ),
                toolDefinitionCount: Array.isArray(body.tools)
                  ? body.tools.length
                  : 0
              }),
        ...(teamPhase === undefined
          ? {}
          : {
              teamPhase,
              teamInputImageCount: teamInputImages.length,
              teamInputImageBytes: teamInputImages.reduce(
                (total, image) => total + image.sizeBytes,
                0
              )
            }),
        ...(scheduleProof
          ? scheduleRequestCount === 1
            ? {
                schedulePhase: "held",
                scheduleAttempt: scheduleRequestCount,
                scheduleReleaseReceived: false,
                scheduleSettled: false,
                scheduleClientClosed: false
              }
            : {
                schedulePhase: "restored",
                scheduleAttempt: scheduleRequestCount
              }
            : {}),
        ...(remoteAssistantProof
          ? {
              remoteAssistantPhase: "held",
              remoteAssistantReleaseReceived: false,
              remoteAssistantSettled: false,
              remoteAssistantClientClosed: false
            }
          : {}),
        ...(mediaRoutingPhase === undefined
          ? {}
          : { mediaRoutingPhase }),
      }
      requests.push(requestEvidence)
      observeProviderResponse(responses, response, { path, model })
      if (model === options.holdResponseForModel) {
        writeHeldTextEventStream(response, "controlled held response", () => {})
        return
      }
      if (scheduleProof) {
        if (scheduleRequestCount === 1) {
          scheduleParent = writeDelayedControlledTextEventStream(
            response,
            WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
            requestEvidence,
            () => {
              requestEvidence.scheduleClientClosed = true
            },
            () => {
              scheduleParent = undefined
            }
          )
          return
        }
        if (scheduleRequestCount === 2) {
          writeTextEventStream(
            response,
            WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE
          )
          return
        }
        throw new Error("Desktop proof Schedule dispatched more than twice")
      }
      if (remoteAssistantProof) {
        if (remoteAssistantObserved) {
          throw new Error("Desktop proof Remote Assistant was dispatched twice")
        }
        remoteAssistantObserved = true
        remoteAssistantParent = writeControlledTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_PARTIAL_RESPONSE,
          requestEvidence,
          () => {
            requestEvidence.remoteAssistantClientClosed = true
          },
          () => {
            remoteAssistantParent = undefined
          }
        )
        return
      }
      if (guidedFollowUpPhase === "parent") {
        if (guidedParentObserved) {
          throw new Error("Desktop proof guided parent was dispatched twice")
        }
        guidedParentObserved = true
        guidedParentEvidence = requestEvidence
        guidedParent = writeControlledTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
          requestEvidence,
          () => {
            requestEvidence.guidedFollowUpClientClosed = true
          },
          () => {
            guidedParent = undefined
          }
        )
        return
      }
      if (sideQueryPhase === "parent") {
        if (sideQueryParentObserved) {
          throw new Error("Desktop proof Side Query parent was dispatched twice")
        }
        sideQueryParentObserved = true
        sideQueryParent = writeControlledTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
          requestEvidence,
          () => {
            requestEvidence.sideQueryParentClientClosed = true
          },
          () => {
            sideQueryParent = undefined
          }
        )
        return
      }
      if (sideQueryPhase === "query") {
        if (
          sideQueryObserved ||
          sideQueryParent === undefined ||
          sideQueryParent.released
        ) {
          throw new Error(
            "Desktop proof Side Query did not run beside its active parent"
          )
        }
        sideQueryObserved = true
        writeTextEventStream(response, WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER)
        return
      }
      if (guidedFollowUpPhase === "child") {
        if (
          guidedChildObserved ||
          guidedParentEvidence?.guidedFollowUpSettled !== true
        ) {
          throw new Error(
            "Desktop proof guided child started before parent settlement"
          )
        }
        guidedChildObserved = true
        writeTextEventStream(response, WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE)
        return
      }
      if (cancelRegenerateRequestCount === 1 && cancelRegenerate) {
        writeHeldTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE,
          () => {
            requestEvidence.cancelRegenerateClientClosed = true
          }
        )
        return
      }
      if (cancelRegenerate) {
        writeTextEventStream(response, WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE)
        return
      }
      if (goal?.phase === "execution") {
        writeTextEventStream(
          response,
          goal.attempt === 1
            ? WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE
            : WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE
        )
        return
      }
      if (goal?.phase === "verifier") {
        writeTextEventStream(response, JSON.stringify(
          goal.attempt === 1
            ? {
                disposition: "continue",
                result: "failed",
                reason: WANEX_DESKTOP_PROOF_GOAL_FIRST_VERIFICATION_REASON
              }
            : {
                disposition: "succeeded",
                result: "passed",
                reason: WANEX_DESKTOP_PROOF_GOAL_FINAL_VERIFICATION_REASON
              }
        ))
        return
      }
      if (planPhase === "generation") {
        writeTextEventStream(response, JSON.stringify({
          title: WANEX_DESKTOP_PROOF_PLAN_TITLE,
          summary: WANEX_DESKTOP_PROOF_PLAN_SUMMARY,
          steps: [{
            id: WANEX_DESKTOP_PROOF_PLAN_STEP_ID,
            title: WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE
          }]
        }))
        return
      }
      if (planPhase === "execution") {
        writeTextEventStream(response, WANEX_DESKTOP_PROOF_PLAN_RESPONSE)
        return
      }
      if (imageGenerationPhase === "tool_call") {
        writeEventStream(response, {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: IMAGE_GENERATION_TOOL_CALL_ID,
                function: {
                  name: "image_generate",
                  arguments: JSON.stringify({
                    prompt: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT
                  })
                }
              }]
            },
            finish_reason: "tool_calls"
          }]
        })
        return
      }
      if (imageGenerationPhase === "tool_unavailable") {
        response.writeHead(400, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: "required proof Tool is unavailable" }))
        return
      }
      if (mediaRoutingPhase === "reader") {
        writeTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_DESCRIPTION
        )
        return
      }
      if (mediaRoutingPhase === "primary_description") {
        writeTextEventStream(
          response,
          WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_RESPONSE
        )
        return
      }
      if (mediaRoutingPhase === "image_reference_tool_call") {
        const resourceId = imageResourceId(body)
        if (resourceId === undefined) {
          throw new Error("Desktop proof image edit resource id is missing")
        }
        writeEventStream(response, {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: IMAGE_EDIT_TOOL_CALL_ID,
                function: {
                  name: "image_generate",
                  arguments: JSON.stringify({
                    prompt: WANEX_DESKTOP_PROOF_IMAGE_EDIT_PROMPT,
                    images: [resourceId]
                  })
                }
              }]
            },
            finish_reason: "tool_calls"
          }]
        })
        return
      }
      if (mediaRoutingPhase === "image_reference_final") {
        writeTextEventStream(response, WANEX_DESKTOP_PROOF_IMAGE_EDIT_RESPONSE)
        return
      }
      writeTextEventStream(
        response,
        imageGenerationPhase === "final"
          ? WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE
          : model === WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID &&
              messageText(body.messages?.at(-1)).includes(WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT)
            ? WANEX_DESKTOP_PROOF_REMOTE_MULTIMODAL_RESPONSE
          : desktopProofProviderResponse(model)
      )
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" })
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    await closeServer(server)
    throw new Error("Desktop proof provider did not expose a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    responses,
    releaseGuidedFollowUpParent() {
      if (guidedParent === undefined || guidedParent.released) return false
      const parent = guidedParent
      parent.released = true
      parent.evidence.guidedFollowUpReleaseReceived = true
      parent.response.end(
        `${textEvent(WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA, "stop")}data: [DONE]\n\n`
      )
      parent.evidence.guidedFollowUpSettled = true
      return true
    },
    releaseSideQueryParent() {
      if (sideQueryParent === undefined || sideQueryParent.released) return false
      const parent = sideQueryParent
      parent.released = true
      parent.evidence.sideQueryReleaseReceived = true
      parent.response.end(
        `${textEvent(WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA, "stop")}data: [DONE]\n\n`
      )
      parent.evidence.sideQueryParentSettled = true
      return true
    },
    releaseSchedule() {
      if (scheduleParent === undefined || scheduleParent.released) return false
      const parent = scheduleParent
      parent.released = true
      parent.evidence.scheduleReleaseReceived = true
      if (!parent.partialWritten) {
        clearTimeout(parent.partialTimer)
        parent.response.write(textEvent(
          WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
          null
        ))
        parent.partialWritten = true
      }
      parent.response.end(
        `${textEvent(WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA, "stop")}data: [DONE]\n\n`
      )
      parent.evidence.scheduleSettled = true
      return true
    },
    releaseRemoteAssistant() {
      if (
        remoteAssistantParent === undefined ||
        remoteAssistantParent.released
      ) return false
      const parent = remoteAssistantParent
      parent.released = true
      parent.evidence.remoteAssistantReleaseReceived = true
      parent.response.end(
        `${textEvent(WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_FINAL_DELTA, "stop")}data: [DONE]\n\n`
      )
      parent.evidence.remoteAssistantSettled = true
      return true
    },
    async close() {
      if (scheduleParent !== undefined) clearTimeout(scheduleParent.partialTimer)
      await closeServer(server)
    }
  }

  async function handleImageReferenceRequest(request, response, path, rawBody) {
    const text = rawBody.toString("utf8")
    if (!text.includes(WANEX_DESKTOP_PROOF_IMAGE_EDIT_PROMPT) ||
        !text.includes('name="image"')) {
      throw new Error("Desktop proof image edit request is invalid")
    }
    const evidence = {
      path,
      model: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
      authorized: request.headers.authorization === `Bearer ${options.credential}`,
      mediaRoutingPhase: "image_reference_media",
      inputImageCount: 1,
      inputImageBytes: rawBody.byteLength
    }
    requests.push(evidence)
    observeProviderResponse(responses, response, { path, model: evidence.model })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({
      data: [{ b64_json: GENERATED_IMAGE_BYTES.toString("base64") }]
    }))
  }
}

function observeProviderResponse(responses, response, request) {
  const evidence = {
    kind: request.path.endsWith("/images/generations")
      ? "image_generation"
      : request.path.endsWith("/chat/completions")
        ? "chat_completion"
        : "other",
    modelClass: providerModelClass(request.model),
    state: "accepted"
  }
  responses.push(evidence)
  response.once("finish", () => {
    evidence.state = "finished"
  })
  response.once("close", () => {
    if (evidence.state !== "finished") evidence.state = "closed_early"
  })
}

function providerModelClass(model) {
  if (model === WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID) return "lifecycle_primary"
  if (model === WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID) return "lifecycle_selected"
  if (model === WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID) return "relaunch"
  if (model === WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID) {
    return "image_generation"
  }
  return "other"
}

function readImageGenerationPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  if (!messageText(latestConversationUser(body)).includes(WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT)) {
    return undefined
  }
  if (body.messages.some((message) =>
    message?.role === "tool" &&
    message.tool_call_id === IMAGE_GENERATION_TOOL_CALL_ID
  )) {
    return "final"
  }
  const hasTool = Array.isArray(body.tools) && body.tools.some((tool) =>
    tool?.type === "function" && tool.function?.name === "image_generate"
  )
  if (!hasTool) {
    return "tool_unavailable"
  }
  return "tool_call"
}

function readMediaRoutingPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = latestConversationUser(body)
  const text = messageText(latestUser)
  if (body.model === WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_MODEL_ID &&
      text.includes("Describe this image for an assistant that cannot see it.")) {
    return "reader"
  }
  if (body.model !== WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID) return undefined
  if (text.includes(WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_TEXT) &&
      JSON.stringify(body).includes(WANEX_DESKTOP_PROOF_IMAGE_UNDERSTANDING_DESCRIPTION)) {
    return "primary_description"
  }
  if (!text.includes(WANEX_DESKTOP_PROOF_IMAGE_EDIT_TEXT)) return undefined
  if (body.messages.some((message) =>
    message?.role === "tool" && message.tool_call_id === IMAGE_EDIT_TOOL_CALL_ID
  )) {
    return "image_reference_final"
  }
  const hasTool = Array.isArray(body.tools) && body.tools.some((tool) =>
    tool?.type === "function" && tool.function?.name === "image_generate"
  )
  return hasTool ? "image_reference_tool_call" : undefined
}

function imageResourceId(body) {
  const latestUser = latestConversationUser(body)
  const match = /\[image ([^,\]\s]+)/.exec(messageText(latestUser))
  return match?.[1]
}

function readPlanPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  const text = messageText(latestUser)
  if (
    text.includes(WANEX_DESKTOP_PROOF_PLAN_REQUEST) &&
    text.includes("Analyze the conversation and the planning request") &&
    text.includes("Return exactly one JSON object")
  ) {
    return "generation"
  }
  if (
    text.startsWith("Execute approved plan ") &&
    text.includes(`Title: ${WANEX_DESKTOP_PROOF_PLAN_TITLE}`) &&
    text.includes(WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE)
  ) {
    return "execution"
  }
  return undefined
}

function readGoalPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  const text = messageText(latestUser)
  if (!text.includes(WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE)) return undefined
  const marker = text.includes("WANEX_GOAL_VERIFIER_V1")
    ? "verifier"
    : text.includes("WANEX_GOAL_ATTEMPT_V1")
      ? "execution"
      : undefined
  if (marker === undefined) return undefined
  const attempt = text.includes('"attemptNumber":2') ||
    text.includes('"number":2')
    ? 2
    : text.includes('"attemptNumber":1') || text.includes('"number":1')
      ? 1
      : undefined
  return attempt === undefined ? undefined : { phase: marker, attempt }
}

function readCancelRegeneratePhase(body) {
  if (!Array.isArray(body?.messages)) return false
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  return messageText(latestUser) === WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT
}

function readGuidedFollowUpPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  const text = messageText(latestUser)
  if (text === WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT) return "parent"
  if (text === WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT) return "child"
  return undefined
}

function readSideQueryProofPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  const text = messageText(latestUser)
  if (text === WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT) return "parent"
  if (text === WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION) return "query"
  return undefined
}

function readTeamProofPhase(body) {
  if (!Array.isArray(body?.messages)) return undefined
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  return messageText(latestUser) === WANEX_DESKTOP_PROOF_TEAM_MESSAGE
    ? "round"
    : undefined
}

function readScheduleProof(body) {
  if (!Array.isArray(body?.messages)) return false
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  return messageText(latestUser) === WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT
}

function readRemoteAssistantProof(body) {
  if (!Array.isArray(body?.messages)) return false
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  return messageText(latestUser).includes(WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MESSAGE)
}

function messageText(message) {
  if (typeof message?.content === "string") return message.content
  if (!Array.isArray(message?.content)) return ""
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
}

function latestConversationUser(body) {
  return [...body.messages].reverse().find((message) =>
    message?.role === "user" &&
    !messageText(message).startsWith("Images returned by the tool calls above:")
  )
}

function writeTextEventStream(response, value) {
  writeEventStream(response, {
    choices: [{ delta: { content: value }, finish_reason: "stop" }]
  })
}

function writeHeldTextEventStream(response, value, onClose) {
  response.once("close", onClose)
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache"
  })
  response.write(`data: ${JSON.stringify({
    choices: [{ delta: { content: value }, finish_reason: null }]
  })}\n\n`)
}

function writeControlledTextEventStream(
  response,
  value,
  evidence,
  onPrematureClose,
  onClose
) {
  const state = { response, evidence, released: false }
  response.once("close", () => {
    if (!state.released) onPrematureClose()
    onClose()
  })
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache"
  })
  response.write(textEvent(value, null))
  return state
}

function writeDelayedControlledTextEventStream(
  response,
  value,
  evidence,
  onPrematureClose,
  onClose
) {
  const state = {
    response,
    evidence,
    released: false,
    partialWritten: false,
    partialTimer: undefined
  }
  response.once("close", () => {
    clearTimeout(state.partialTimer)
    if (!state.released) onPrematureClose()
    onClose()
  })
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache"
  })
  state.partialTimer = setTimeout(() => {
    if (state.released) return
    response.write(textEvent(value, null))
    state.partialWritten = true
  }, 1_000)
  return state
}

function textEvent(value, finishReason) {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content: value }, finish_reason: finishReason }]
  })}\n\n`
}

function writeEventStream(response, value) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache"
  })
  response.end(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`)
}

function inspectImageInputs(body) {
  const images = []
  if (!Array.isArray(body?.messages)) return images
  for (const message of body.messages) {
    if (!Array.isArray(message?.content)) continue
    for (const part of message.content) {
      const url = part?.type === "image_url" ? part.image_url?.url : undefined
      if (typeof url !== "string") continue
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(url)
      if (match?.[1] === undefined || match[2] === undefined) {
        throw new Error("Desktop proof Provider image input is invalid")
      }
      const bytes = Buffer.from(match[2], "base64")
      if (bytes.byteLength === 0) {
        throw new Error("Desktop proof Provider image input is empty")
      }
      images.push({ mediaType: match[1], sizeBytes: bytes.byteLength })
    }
  }
  return images
}

function inspectLatestUserImageInputs(body) {
  if (!Array.isArray(body?.messages)) return []
  const latestUser = [...body.messages]
    .reverse()
    .find((message) => message?.role === "user")
  return latestUser === undefined
    ? []
    : inspectImageInputs({ messages: [latestUser] })
}

export function desktopProofProviderResponse(model) {
  return `Proof response from ${model}`
}

async function readRequestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Desktop proof provider request is too large")
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody(request) {
  return JSON.parse((await readRequestBody(request)).toString("utf8"))
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
    server.closeAllConnections()
  })
}

export async function seedDesktopDirectImage({ userDataDir, profileId, serviceBin }) {
  const runtime = new WanexRuntimeHost({
    storageConfig: { kind: "local-profile", rootDir: userDataDir, profileId, mode: "persistent", serviceBin },
    provider: new GeminiAdapter({ providerId: "desktop-direct-image", baseUrl: "https://fixture.invalid", apiKey: "fixture-only",
      model: { id: "desktop-direct-image", operations: ["conversation"], inputModalities: ["text", "image"],
        outputModalities: ["text", "image"], features: [], catalog: { source: "custom", catalogId: "desktop-proof", revision: "1" } },
      async fetch() {
        return { ok: true, status: 200, statusText: "OK", text: async () => "",
          body: (async function* () {
            yield `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [
              { text: "Installed direct image before" },
              { inlineData: { mimeType: "image/png", data: GENERATED_IMAGE_BYTES.toString("base64") }, thoughtSignature: "desktop-private-image-signature" },
              { text: "Installed direct image after" }
            ] }, finishReason: "STOP" }] })}\n\n`
          })() }
      }
    })
  })
  try {
    const sessions = await runtime.storage.listSessions({ status: "active" })
    if (sessions.length !== 1) throw new Error("Direct image fixture requires the existing relaunch conversation")
    const submitted = await runtime.submitUserTurn({ sessionId: sessions[0].id,
      content: [{ type: "text", text: "Restore this direct image after restarting" }] })
    const result = await runtime.runOnce()
    if (result.results[0]?.worker.status !== "completed") throw new Error("Direct image fixture did not complete")
    const invocations = await runtime.storage.listProviderInvocations({ turnId: submitted.turnId })
    const image = invocations[0]?.responseCheckpoint?.parts.find((part) => part.type === "resource")
    if (!image || invocations[0]?.state !== "succeeded") throw new Error("Direct image checkpoint is missing")
    const provenance = await runtime.storage.listResourceProvenance({ causeKind: "provider_output", causeId: invocations[0].id })
    if (provenance.length !== 1) throw new Error("Direct image provenance is missing")
    return { sessionId: submitted.session.id, resourceId: image.resourceId, sha256: image.sha256, sizeBytes: image.sizeBytes }
  } finally { await runtime.dispose() }
}
