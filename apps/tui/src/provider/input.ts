import {
  PROVIDER_PRESETS,
  resolveCredentialEndpoints,
  unresolvedConversationModel,
  type ProviderPresetId,
  type ProviderSetupInput
} from "@wanex/assistant"
import { TuiTrustedTerminalReader } from "../host/terminal-reader.js"

const MAX_MODEL_ID_BYTES = 256
const MAX_BASE_URL_BYTES = 2_048
const MAX_CREDENTIAL_BYTES = 16 * 1_024

export async function readTuiProviderSetup(
  reader: TuiTrustedTerminalReader
): Promise<ProviderSetupInput & { readonly credential: string }> {
  const input = await readTuiProviderSetupInput(reader)
  const credential = await readTuiProviderCredential(reader)
  return { ...input, credential }
}

export async function readTuiProviderSetupInput(
  reader: TuiTrustedTerminalReader
): Promise<ProviderSetupInput> {
  PROVIDER_PRESETS.forEach((preset, index) => {
    reader.write(`  ${index + 1}. ${preset.label}\r\n`)
  })
  return await readValidatedProviderSetup(reader)
}

export async function readTuiProviderCredential(
  reader: TuiTrustedTerminalReader
): Promise<string> {
  return await reader.readLine({
    prompt: "API key: ",
    maxBytes: MAX_CREDENTIAL_BYTES,
    secret: true
  })
}

async function readValidatedProviderSetup(
  reader: TuiTrustedTerminalReader
): Promise<ProviderSetupInput> {
  while (true) {
    const preset = await readProviderPreset(reader)
    const conversationModelId = await reader.readLine({
      prompt: "\r\nModel ID: ",
      maxBytes: MAX_MODEL_ID_BYTES
    })
    const baseUrl = preset === "openai-compatible"
      ? await reader.readLine({
          prompt: "Base URL: ",
          maxBytes: MAX_BASE_URL_BYTES
        })
      : undefined
    const input: ProviderSetupInput = {
      presetId: preset,
      conversationModelId,
      ...(baseUrl === undefined ? {} : { baseUrl })
    }
    try {
      resolveCredentialEndpoints(input, {
        resolveConversationModel(providerId, modelId) {
          return unresolvedConversationModel(providerId, modelId)
        }
      })
      return input
    } catch (error) {
      reader.write(
        `Invalid Provider configuration: ${errorMessage(error)}\r\n` +
        "Please try again.\r\n"
      )
    }
  }
}

async function readProviderPreset(
  reader: TuiTrustedTerminalReader
): Promise<ProviderPresetId> {
  while (true) {
    const value = await reader.readLine({
      prompt: "\r\nProvider [1-4]: ",
      maxBytes: 1
    })
    const preset = PROVIDER_PRESETS[Number(value) - 1]
    if (preset !== undefined) return preset.id
    reader.write("Choose a number from 1 to 4.\r\n")
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
