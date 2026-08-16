/**
 * poll.mjs open-bill cursor helpers.
 *
 * The latest-bills pass must run every time, but rechecking every unfinished bill in
 * one Action run monopolizes the self-hosted runner.  These helpers keep that
 * follow-up pass bounded and hand the next slice to the next scheduled run.
 */

export const DEFAULT_OPEN_BILL_BATCH_SIZE = 200;

export function parsePositiveInt(value, fallback = DEFAULT_OPEN_BILL_BATCH_SIZE) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizePollState(state) {
  if (!state || typeof state !== 'object') return { nextBillId: null };
  return {
    nextBillId: typeof state.nextBillId === 'string' && state.nextBillId.length > 0 ? state.nextBillId : null,
  };
}

export function selectOpenBillBatch(openBills, state, limit) {
  const sorted = [...openBills].sort((a, b) => String(a.billId).localeCompare(String(b.billId)));
  if (sorted.length === 0) {
    return { batch: [], nextState: { nextBillId: null }, wrapped: false, totalOpen: 0 };
  }

  const safeLimit = Math.max(1, Math.min(limit, sorted.length));
  const cursor = normalizePollState(state).nextBillId;
  let startIndex = 0;
  if (cursor) {
    const exactIndex = sorted.findIndex((bill) => bill.billId === cursor);
    if (exactIndex >= 0) {
      startIndex = exactIndex;
    } else {
      const nextIndex = sorted.findIndex((bill) => String(bill.billId).localeCompare(cursor) > 0);
      startIndex = nextIndex >= 0 ? nextIndex : 0;
    }
  }

  const batch = [];
  let wrapped = false;
  for (let i = 0; i < safeLimit; i += 1) {
    const index = (startIndex + i) % sorted.length;
    if (index < startIndex) wrapped = true;
    batch.push(sorted[index]);
  }

  const nextIndex = (startIndex + batch.length) % sorted.length;
  if (nextIndex <= startIndex && batch.length < sorted.length) wrapped = true;
  return {
    batch,
    nextState: { nextBillId: sorted[nextIndex]?.billId ?? null },
    wrapped,
    totalOpen: sorted.length,
  };
}
