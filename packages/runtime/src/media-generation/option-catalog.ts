import { normalizeModelOptions, type ModelOptionDescriptor } from "@wanex/protocol"

const aspectRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]

function choice(name: string, description: string, values: readonly string[]): ModelOptionDescriptor {
  return { name, description, type: "string", enum: values }
}

function count(maximum: number): ModelOptionDescriptor {
  return { name: "n", description: "Number of images to generate.", type: "integer", minimum: 1, maximum }
}

/** Conservative, exact-ID catalog. Unknown IDs never inherit family-wide options. */
export function imageGenerationOptionCatalog(protocolId: string, modelId: string): readonly ModelOptionDescriptor[] {
  let options: readonly ModelOptionDescriptor[] = []
  if (protocolId === "openai-images") {
    if (["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5"].includes(modelId)) {
      options = [
        count(10),
        choice("quality", "Image rendering quality.", ["auto", "low", "medium", "high"]),
        choice("size", "Output image dimensions.", ["auto", "1024x1024", "1024x1536", "1536x1024"]),
        choice("output_format", "Output image format.", ["png", "jpeg", "webp"])
      ]
    } else if (modelId === "dall-e-3") {
      options = [count(1), choice("quality", "Image rendering quality.", ["standard", "hd"]),
        choice("size", "Output image dimensions.", ["1024x1024", "1024x1792", "1792x1024"]),
        choice("style", "Image rendering style.", ["vivid", "natural"])]
    } else if (modelId === "dall-e-2") {
      options = [count(10), choice("size", "Output image dimensions.", ["256x256", "512x512", "1024x1024"])]
    }
  } else if (protocolId === "gemini-image") {
    if (modelId === "gemini-2.5-flash-image") {
      options = [choice("aspect_ratio", "Output image aspect ratio.", aspectRatios)]
    } else if (["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3-pro-image"].includes(modelId)) {
      options = [choice("aspect_ratio", "Output image aspect ratio.", aspectRatios),
        choice("image_size", "Output image resolution tier.", ["1K", "2K", "4K"]),
        choice("output_mime_type", "Output image media type.", ["image/png", "image/jpeg"])]
    }
  } else if (protocolId === "volcengine-seedream") {
    if (["doubao-seedream-4-0-250828", "doubao-seedream-4-5-251128"].includes(modelId)) {
      options = [choice("size", "Output image resolution tier.", modelId === "doubao-seedream-4-0-250828" ? ["1K", "2K", "4K"] : ["2K", "4K"]),
        { name: "watermark", description: "Include the provider watermark.", type: "boolean" }]
    }
  }
  // OpenRouter support is endpoint-specific, not implied by a model slug.
  // Without a frozen endpoint declaration its built-in catalog stays empty.
  return normalizeModelOptions(options)
}
