import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";
import type { Terminal } from "@earendil-works/pi-tui";

const XtermTerminal = xterm.Terminal;

export class TuiVirtualTerminal implements Terminal {
  private readonly xterm: XtermTerminalType;
  private inputHandler: ((data: string) => void) | undefined;
  private resizeHandler: (() => void) | undefined;
  private columnCount: number;
  private rowCount: number;
  private active = false;
  private drainCount = 0;
  private stopCount = 0;
  private readonly outputChunks: string[] = [];

  readonly titles: string[] = [];

  constructor(columns = 80, rows = 24) {
    this.columnCount = columns;
    this.rowCount = rows;
    this.xterm = new XtermTerminal({
      cols: columns,
      rows,
      disableStdin: true,
      allowProposedApi: true,
    });
    this.xterm.onTitleChange((title) => this.titles.push(title));
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.active = true;
    this.inputHandler = onInput;
    this.resizeHandler = onResize;
    this.xterm.write("\u001b[?2004h");
  }

  async drainInput(): Promise<void> {
    this.drainCount += 1;
  }

  stop(): void {
    this.stopCount += 1;
    this.active = false;
    this.xterm.write("\u001b[?2004l");
    this.inputHandler = undefined;
    this.resizeHandler = undefined;
  }

  write(data: string): void {
    this.outputChunks.push(data);
    this.xterm.write(data);
  }

  get columns(): number {
    return this.columnCount;
  }

  get rows(): number {
    return this.rowCount;
  }

  get kittyProtocolActive(): boolean {
    return true;
  }

  moveBy(lines: number): void {
    if (lines > 0) this.xterm.write(`\u001b[${lines}B`);
    if (lines < 0) this.xterm.write(`\u001b[${-lines}A`);
  }

  hideCursor(): void {
    this.xterm.write("\u001b[?25l");
  }

  showCursor(): void {
    this.xterm.write("\u001b[?25h");
  }

  clearLine(): void {
    this.xterm.write("\u001b[K");
  }

  clearFromCursor(): void {
    this.xterm.write("\u001b[J");
  }

  clearScreen(): void {
    this.xterm.write("\u001b[2J\u001b[H");
  }

  setTitle(title: string): void {
    this.xterm.write(`\u001b]0;${title}\u0007`);
  }

  setProgress(): void {}

  sendInput(data: string): void {
    this.inputHandler?.(data);
  }

  resize(columns: number, rows: number): void {
    this.columnCount = columns;
    this.rowCount = rows;
    this.xterm.resize(columns, rows);
    this.resizeHandler?.();
  }

  async flush(): Promise<void> {
    await new Promise<void>((resolve) => this.xterm.write("", resolve));
  }

  async waitForRender(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    await this.flush();
  }

  async viewport(): Promise<readonly string[]> {
    await this.waitForRender();
    const lines: string[] = [];
    const buffer = this.xterm.buffer.active;
    for (let index = 0; index < this.xterm.rows; index += 1) {
      lines.push(
        buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? "",
      );
    }
    return lines;
  }

  async text(): Promise<string> {
    return (await this.viewport()).join("\n");
  }

  lifecycle(): {
    readonly active: boolean;
    readonly drainCount: number;
    readonly stopCount: number;
  } {
    return {
      active: this.active,
      drainCount: this.drainCount,
      stopCount: this.stopCount,
    };
  }

  outputHistory(): string {
    return this.outputChunks.join("")
  }
}
