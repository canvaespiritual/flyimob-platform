import type { EventInput } from "./validation";

type Interval = { start: number; end: number };
export function retainOneShotPitch<T extends { type: string }>(events: T[], alreadyReached: boolean): T[] {
  let available = !alreadyReached;
  return events.filter((event) => event.type !== "PITCH_REACHED" || (available && (available = false, true)));
}
export function unionLength(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  let total = 0;
  let start = 0;
  let end = 0;
  for (const range of sorted) {
    if (range.start > end) {
      total += end - start;
      start = range.start;
      end = range.end;
    } else end = Math.max(end, range.end);
  }
  return total + end - start;
}

type MetricRange = { startMs: number; endMs: number; observedStartAt: Date; observedEndAt: Date };
export function watchMetrics(ranges: MetricRange[]) {
  return {
    // Union of wall-clock observations prevents overlapping reports counting twice.
    watchedSeconds: unionLength(ranges.map((r) => ({ start: r.observedStartAt.getTime(), end: r.observedEndAt.getTime() }))) / 1000,
    uniqueWatchedSeconds: unionLength(ranges.map((r) => ({ start: r.startMs, end: r.endMs }))) / 1000,
  };
}

type SessionMetrics = {
  currentSecond: number;
  maxReachedSecond: number;
  lastPositionSequence: number;
  playStartedAt: Date | null;
  pitchReachedAt: Date | null;
  checkoutOpenedAt: Date | null;
  checkoutClickedAt: Date | null;
};
function earliest(a: Date | null, b: Date): Date { return !a || b < a ? b : a; }

export function eventMetrics(session: SessionMetrics, events: EventInput[]): SessionMetrics {
  const result: SessionMetrics = {
    currentSecond: session.currentSecond,
    maxReachedSecond: session.maxReachedSecond,
    lastPositionSequence: session.lastPositionSequence,
    playStartedAt: session.playStartedAt,
    pitchReachedAt: session.pitchReachedAt,
    checkoutOpenedAt: session.checkoutOpenedAt,
    checkoutClickedAt: session.checkoutClickedAt,
  };
  for (const event of events) {
    if (event.positionSecond !== null) {
      result.maxReachedSecond = Math.max(result.maxReachedSecond, event.positionSecond);
      if (event.sequence > result.lastPositionSequence) {
        result.currentSecond = event.positionSecond;
        result.lastPositionSequence = event.sequence;
      }
    }
    for (const range of event.ranges) result.maxReachedSecond = Math.max(result.maxReachedSecond, range.endMs / 1000);
    if (event.type === "PLAY") result.playStartedAt = earliest(result.playStartedAt, event.clientAt);
    if (event.type === "PITCH_REACHED") result.pitchReachedAt = earliest(result.pitchReachedAt, event.clientAt);
    if (event.type === "CHECKOUT_OPEN") result.checkoutOpenedAt = earliest(result.checkoutOpenedAt, event.clientAt);
    if (event.type === "CHECKOUT_CLICK") result.checkoutClickedAt = earliest(result.checkoutClickedAt, event.clientAt);
  }
  return result;
}
