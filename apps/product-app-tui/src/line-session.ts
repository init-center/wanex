import { renderProductAppTuiFrame } from "./presenter.js"
import {
  createProductAppTuiLineSessionState,
  productAppTuiLineSessionResult
} from "./line-session-state.js"
import { writeLine } from "./line-session-output.js"
import {
  parseProductAppTuiLineCommand
} from "./line-session-command-parser.js"
import {
  executeProductAppTuiLineCommand
} from "./line-session-handlers.js"
import { safeErrorMessage } from "./line-session-text.js"
import type {
  ProductAppTuiLineSessionOptions,
  ProductAppTuiLineSessionResult
} from "./types.js"

export async function runProductAppTuiLineSession(
  options: ProductAppTuiLineSessionOptions
): Promise<ProductAppTuiLineSessionResult> {
  const state = createProductAppTuiLineSessionState(options.surface)
  const iterator = options.input[Symbol.asyncIterator]()

  await writeLine(
    options,
    renderProductAppTuiFrame(
      options.surface.snapshot(),
      options.renderOptions
    ).text
  )
  await writeLine(options, "Type help for commands.")

  for (;;) {
    const next = await iterator.next()
    if (next.done) break
    const rawLine = next.value
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }
    state.handledLineCount += 1
    const parsed = parseProductAppTuiLineCommand(line)
    if (parsed.kind === "error") {
      state.errorCount += 1
      await writeLine(options, `error: ${parsed.message}`)
      continue
    }
    state.commandCount += 1
    try {
      await executeProductAppTuiLineCommand({
        sessionOptions: options,
        state,
        command: parsed,
        readLine: async () => {
          const nextInput = await iterator.next()
          return nextInput.done ? undefined : nextInput.value
        }
      })
      if (state.quit) {
        return productAppTuiLineSessionResult(state)
      }
    } catch (error) {
      state.errorCount += 1
      await writeLine(options, `error: ${safeErrorMessage(error)}`)
    }
  }

  return productAppTuiLineSessionResult(state)
}
