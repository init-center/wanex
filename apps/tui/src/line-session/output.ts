import type {
  TuiLineSessionOptions
} from "../model.js"

export async function writeLine(
  options: TuiLineSessionOptions,
  text: string
): Promise<void> {
  await options.write(`${text}\n`)
}
