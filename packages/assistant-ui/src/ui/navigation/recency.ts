export type RecencyGroup = "today" | "yesterday" | "week" | "earlier";

export const RECENCY_LABEL: Readonly<Record<RecencyGroup, string>> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Previous 7 days",
  earlier: "Earlier",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Splits already-ordered rows into calendar-day buckets, keeping order and dropping empty buckets. */
export function groupByRecency<T extends { readonly updatedAt: number }>(
  rows: readonly T[],
  now: number = Date.now(),
): readonly { readonly group: RecencyGroup; readonly rows: readonly T[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const buckets = new Map<RecencyGroup, T[]>();
  for (const row of rows) {
    const group: RecencyGroup = row.updatedAt >= today
      ? "today"
      : row.updatedAt >= today - DAY_MS
        ? "yesterday"
        : row.updatedAt >= today - 6 * DAY_MS
          ? "week"
          : "earlier";
    const bucket = buckets.get(group);
    if (bucket === undefined) buckets.set(group, [row]);
    else bucket.push(row);
  }
  return (["today", "yesterday", "week", "earlier"] as const)
    .filter((group) => buckets.has(group))
    .map((group) => ({ group, rows: buckets.get(group)! }));
}
