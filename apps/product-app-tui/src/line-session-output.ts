import type {
  ProductAppTuiLineSessionOptions
} from "./types.js"

export async function writeLine(
  options: ProductAppTuiLineSessionOptions,
  text: string
): Promise<void> {
  await options.write(`${text}\n`)
}
