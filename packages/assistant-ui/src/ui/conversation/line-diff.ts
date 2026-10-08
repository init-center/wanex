export type DiffRow =
  | { readonly kind: "same" | "add" | "del"; readonly text: string; readonly oldNo?: number; readonly newNo?: number }
  | { readonly kind: "gap"; readonly hidden: number };

/** Above this many cell comparisons the diff falls back to replace-all instead of stalling the UI. */
const MAX_CELLS = 250_000;
const CONTEXT_LINES = 3;

/**
 * Line diff for a bounded text preview. Unchanged runs longer than the context
 * window collapse into a single gap row so a one-line change stays readable.
 */
export function lineDiff(before: string | undefined, after: string | undefined): readonly DiffRow[] {
  const a = split(before);
  const b = split(after);
  const rows = a.length * b.length > MAX_CELLS ? replaceAll(a, b) : lcsDiff(a, b);
  return collapse(rows);
}

function split(text: string | undefined): readonly string[] {
  if (text === undefined || text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function replaceAll(a: readonly string[], b: readonly string[]): DiffRow[] {
  return [
    ...a.map((text, index): DiffRow => ({ kind: "del", text, oldNo: index + 1 })),
    ...b.map((text, index): DiffRow => ({ kind: "add", text, newNo: index + 1 })),
  ];
}

function lcsDiff(a: readonly string[], b: readonly string[]): DiffRow[] {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i]!, oldNo: i + 1, newNo: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      rows.push({ kind: "del", text: a[i]!, oldNo: i + 1 });
      i += 1;
    } else {
      rows.push({ kind: "add", text: b[j]!, newNo: j + 1 });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) rows.push({ kind: "del", text: a[i]!, oldNo: i + 1 });
  for (; j < b.length; j += 1) rows.push({ kind: "add", text: b[j]!, newNo: j + 1 });
  return rows;
}

function collapse(rows: readonly DiffRow[]): readonly DiffRow[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.kind === "same") return;
    for (let k = Math.max(0, index - CONTEXT_LINES); k <= Math.min(rows.length - 1, index + CONTEXT_LINES); k += 1) {
      keep[k] = true;
    }
  });
  if (!keep.includes(true)) return rows.length === 0 ? [] : [{ kind: "gap", hidden: rows.length }];
  const result: DiffRow[] = [];
  let hidden = 0;
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (hidden > 0) result.push({ kind: "gap", hidden });
      hidden = 0;
      result.push(row);
    } else {
      hidden += 1;
    }
  });
  if (hidden > 0) result.push({ kind: "gap", hidden });
  return result;
}
