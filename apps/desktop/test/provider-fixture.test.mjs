import { afterEach, describe, expect, it } from "vitest"
import {
  listenDesktopProofProvider,
  desktopProofProviderResponse
} from "../scripts/provider-fixture.mjs"
import {
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
  WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION,
  WANEX_DESKTOP_PROOF_CODING_FILE,
  WANEX_DESKTOP_PROOF_CODING_MESSAGE,
  WANEX_DESKTOP_PROOF_CODING_RESPONSE,
  WANEX_DESKTOP_PROOF_CODING_TOOL_CALL_ID,
  WANEX_DESKTOP_PROOF_CODING_TOOL_NAME
} from "../src/proof-contract.ts"

const fixtures = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()))
})

describe("Desktop proof Provider fixture", () => {
  it("models a Coding Tool call followed by a Tool result", async () => {
    const credential = "proof-coding-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)
    const headers = {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json"
    }
    const tools = [{
      type: "function",
      function: { name: WANEX_DESKTOP_PROOF_CODING_TOOL_NAME }
    }]
    const first = await fetch(`${fixture.baseUrl}/coding/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [{ role: "user", content: WANEX_DESKTOP_PROOF_CODING_MESSAGE }],
        tools,
        stream: true
      })
    })
    expect(first.status).toBe(200)
    expect(await first.text()).toContain(WANEX_DESKTOP_PROOF_CODING_TOOL_NAME)

    const second = await fetch(`${fixture.baseUrl}/coding/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [
          { role: "user", content: WANEX_DESKTOP_PROOF_CODING_MESSAGE },
          {
            role: "assistant",
            tool_calls: [{
              id: WANEX_DESKTOP_PROOF_CODING_TOOL_CALL_ID,
              type: "function",
              function: {
                name: WANEX_DESKTOP_PROOF_CODING_TOOL_NAME,
                arguments: JSON.stringify({
                  changes: [{ path: WANEX_DESKTOP_PROOF_CODING_FILE }]
                })
              }
            }]
          },
          {
            role: "tool",
            tool_call_id: WANEX_DESKTOP_PROOF_CODING_TOOL_CALL_ID,
            content: "applied"
          }
        ],
        tools,
        stream: true
      })
    })
    expect(second.status).toBe(200)
    expect(await second.text()).toContain(WANEX_DESKTOP_PROOF_CODING_RESPONSE)
    expect(fixture.requests).toEqual([
      {
        path: "/v1/coding/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        codingPhase: "tool_call",
        codingToolName: WANEX_DESKTOP_PROOF_CODING_TOOL_NAME,
        codingToolCallId: WANEX_DESKTOP_PROOF_CODING_TOOL_CALL_ID
      },
      {
        path: "/v1/coding/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        codingPhase: "final",
        codingToolResultPresent: true
      }
    ])
    expect(JSON.stringify(fixture.requests)).not.toContain(credential)
    expect(JSON.stringify(fixture.requests)).not.toContain(WANEX_DESKTOP_PROOF_CODING_MESSAGE)
    expect(JSON.stringify(fixture.requests)).not.toContain(WANEX_DESKTOP_PROOF_CODING_FILE)
  })

  it("holds exactly one Schedule response and restores without retaining the prompt", async () => {
    const credential = "proof-schedule-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)
    const headers = {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json"
    }
    const request = () => fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [{ role: "user", content: WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT }],
        stream: true
      })
    })

    const firstPromise = request()
    await waitFor(() => fixture.requests.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 1_050))
    expect(fixture.releaseSchedule()).toBe(true)
    expect(fixture.releaseSchedule()).toBe(false)
    const first = await firstPromise
    const firstStream = await first.text()
    expect(firstStream).toContain(WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE)
    expect(firstStream).toContain(WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA)

    const second = await request()
    expect(await second.text()).toContain(
      WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE
    )
    expect(fixture.requests).toEqual([
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        schedulePhase: "held",
        scheduleAttempt: 1,
        scheduleReleaseReceived: true,
        scheduleSettled: true,
        scheduleClientClosed: false
      },
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        schedulePhase: "restored",
        scheduleAttempt: 2
      }
    ])
    const retained = JSON.stringify(fixture.requests)
    expect(retained).not.toContain(credential)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE)
  })

  it("records only bounded non-secret request evidence", async () => {
    const credential = "proof-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)

    const response = await fetch(`${fixture.baseUrl}/selected/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "proof-model",
        messages: [{
          role: "user",
          content: [{
            type: "image_url",
            image_url: { url: "data:image/png;base64,AQID" }
          }]
        }],
        stream: true
      })
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain(
      desktopProofProviderResponse("proof-model")
    )
    expect(fixture.requests).toEqual([{
      path: "/v1/selected/chat/completions",
      model: "proof-model",
      authorized: true,
      imageInputCount: 1,
      imageMediaTypes: ["image/png"],
      imageBytes: 3
    }])
    expect(JSON.stringify(fixture.requests)).not.toContain(credential)
  })

  it("drives image generation without retaining prompts or generated bytes", async () => {
    const credential = "proof-image-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)
    const headers = {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json"
    }
    const first = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [{
          role: "user",
          content: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT
        }],
        tools: [{
          type: "function",
          function: { name: "image_generate" }
        }]
      })
    })
    expect(await first.text()).toContain("image_generate")

    const image = await fetch(`${fixture.baseUrl}/relaunch/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
        prompt: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT
      })
    })
    const imageBody = await image.json()
    expect(Buffer.from(imageBody.data[0].b64_json, "base64").byteLength).toBe(68)

    const final = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [
          { role: "user", content: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT },
          {
            role: "tool",
            tool_call_id: "call_desktop_proof_image_generate",
            content: "generated resource"
          }
        ],
        tools: [{
          type: "function",
          function: { name: "image_generate" }
        }]
      })
    })
    expect(await final.text()).toContain(
      WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE
    )

    expect(fixture.requests).toEqual([
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        imageGenerationPhase: "tool_call"
      },
      {
        path: "/v1/relaunch/images/generations",
        model: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
        authorized: true,
        imageGenerationPhase: "media",
        generatedImageCount: 1,
        generatedImageMediaTypes: ["image/png"],
        generatedImageBytes: 68
      },
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        imageGenerationPhase: "final"
      }
    ])
    const retained = JSON.stringify(fixture.requests)
    expect(retained).not.toContain(credential)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT)
    expect(retained).not.toContain("b64_json")
  })

  it("releases one guided parent only after explicit admission evidence", async () => {
    const credential = "proof-guided-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)
    const headers = {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json"
    }
    const parent = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [{
          role: "user",
          content: WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT
        }],
        stream: true
      })
    })

    expect(parent.status).toBe(200)
    expect(fixture.requests).toEqual([{
      path: "/v1/relaunch/chat/completions",
      model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
      authorized: true,
      imageInputCount: 0,
      imageMediaTypes: [],
      imageBytes: 0,
      guidedFollowUpPhase: "parent",
      guidedFollowUpReleaseReceived: false,
      guidedFollowUpSettled: false,
      guidedFollowUpClientClosed: false
    }])
    expect(fixture.releaseGuidedFollowUpParent()).toBe(true)
    expect(fixture.releaseGuidedFollowUpParent()).toBe(false)
    const parentStream = await parent.text()
    expect(parentStream).toContain(
      WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE
    )
    expect(parentStream).toContain(WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA)

    const child = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [
          { role: "user", content: WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT },
          { role: "assistant", content: WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE },
          { role: "user", content: WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT }
        ],
        stream: true
      })
    })
    expect(await child.text()).toContain(WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE)
    expect(fixture.requests).toEqual([
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        guidedFollowUpPhase: "parent",
        guidedFollowUpReleaseReceived: true,
        guidedFollowUpSettled: true,
        guidedFollowUpClientClosed: false
      },
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        guidedFollowUpPhase: "child",
        guidedFollowUpParentSettledBeforeRequest: true
      }
    ])
    const retained = JSON.stringify(fixture.requests)
    expect(retained).not.toContain(credential)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT)
    expect(retained).not.toContain(
      WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE
    )
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE)
  })

  it("answers one tool-free Side Query beside an active parent", async () => {
    const credential = "proof-side-query-fixture-secret"
    const fixture = await listenDesktopProofProvider({ credential })
    fixtures.push(fixture)
    const headers = {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json"
    }
    const parent = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [{
          role: "user",
          content: WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT
        }],
        stream: true
      })
    })
    const query = await fetch(`${fixture.baseUrl}/relaunch/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        messages: [
          { role: "user", content: WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT },
          { role: "user", content: WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION }
        ],
        stream: true
      })
    })

    expect(await query.text()).toContain(WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER)
    expect(fixture.requests[1]).toMatchObject({
      sideQueryPhase: "query",
      sideQueryParentActiveAtRequest: true,
      sideQueryParentContextPresent: true,
      toolDefinitionCount: 0
    })
    expect(fixture.releaseSideQueryParent()).toBe(true)
    expect(fixture.releaseSideQueryParent()).toBe(false)
    const parentStream = await parent.text()
    expect(parentStream).toContain(
      WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE
    )
    expect(parentStream).toContain(
      WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA
    )
    expect(fixture.requests).toEqual([
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        sideQueryPhase: "parent",
        sideQueryReleaseReceived: true,
        sideQueryParentSettled: true,
        sideQueryParentClientClosed: false
      },
      {
        path: "/v1/relaunch/chat/completions",
        model: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
        authorized: true,
        imageInputCount: 0,
        imageMediaTypes: [],
        imageBytes: 0,
        sideQueryPhase: "query",
        sideQueryParentActiveAtRequest: true,
        sideQueryParentContextPresent: true,
        toolDefinitionCount: 0
      }
    ])
    const retained = JSON.stringify(fixture.requests)
    expect(retained).not.toContain(credential)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION)
    expect(retained).not.toContain(WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER)
  })
})

async function waitFor(read, timeoutMs = 3_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (read()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Provider fixture test timed out")
}
