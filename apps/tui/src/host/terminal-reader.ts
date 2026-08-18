import type { Terminal } from "@earendil-works/pi-tui"

export class TuiTrustedTerminalReader {
  private active = false
  private inputHandler: ((data: string) => void) | undefined

  constructor(private readonly options: {
    readonly terminal: Terminal
    readonly signal?: AbortSignal
    readonly cancellationMessage: string
  }) {}

  start(): void {
    if (this.active) return
    this.active = true
    this.options.terminal.start(
      (data) => this.inputHandler?.(data),
      () => undefined
    )
  }

  write(value: string): void {
    this.options.terminal.write(value)
  }

  async readLine(options: {
    readonly prompt: string
    readonly maxBytes: number
    readonly secret?: boolean
    readonly allowEmpty?: boolean
  }): Promise<string> {
    if (!this.active) throw new Error("trusted terminal reader is not active")
    this.write(options.prompt)
    let value = ""
    return await new Promise<string>((resolve, reject) => {
      const cancelled = () => new Error(this.options.cancellationMessage)
      const abort = () => finish(() => reject(cancelled()))
      const finish = (complete: () => void) => {
        this.inputHandler = undefined
        this.options.signal?.removeEventListener("abort", abort)
        complete()
      }
      this.options.signal?.addEventListener("abort", abort, { once: true })
      if (this.options.signal?.aborted === true) {
        abort()
        return
      }
      this.inputHandler = (data) => {
        const input = unwrapBracketedPaste(data)
        for (const character of input) {
          if (character === "\u0003") {
            finish(() => reject(cancelled()))
            return
          }
          if (character === "\r" || character === "\n") {
            const normalized = value.trim()
            if (normalized.length === 0 && options.allowEmpty !== true) {
              this.write("\u0007")
              continue
            }
            this.write("\r\n")
            finish(() => resolve(normalized))
            return
          }
          if (character === "\u007f" || character === "\b") {
            const codePoints = [...value]
            if (codePoints.length > 0) {
              codePoints.pop()
              value = codePoints.join("")
              this.write("\b \b")
            }
            continue
          }
          if (character === "\u001b" || character < " ") continue
          const next = value + character
          if (Buffer.byteLength(next, "utf8") > options.maxBytes) {
            this.write("\u0007")
            continue
          }
          value = next
          this.write(options.secret === true ? "*" : character)
        }
      }
    })
  }

  async stop(): Promise<void> {
    if (!this.active) return
    this.inputHandler = undefined
    await this.options.terminal.drainInput()
    this.options.terminal.showCursor()
    this.options.terminal.stop()
    this.active = false
  }
}

function unwrapBracketedPaste(value: string): string {
  return value
    .replace(/^\u001b\[200~/, "")
    .replace(/\u001b\[201~$/, "")
}
