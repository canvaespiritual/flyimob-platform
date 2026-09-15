export const LIMITS = {
  bodyBytes: 32 * 1024,
  eventsPerBatch: 20,
  rangesPerBatch: 20,
  metadataBytes: 1024,
  metadataDepth: 3,
  metadataNodes: 100,
  maxVideoMs: 6 * 60 * 60 * 1000,
  maxObservationMs: 30_000,
  maxPlaybackRate: 2,
  clockSkewMs: 5 * 60 * 1000,
  idleMs: 30 * 60 * 1000,
  sessionMs: 24 * 60 * 60 * 1000,
  eventsPerSession: 10_000,
  rangesPerSession: 10_000,
  visitorCookieSeconds: 180 * 24 * 60 * 60,
} as const;

export const EVENT_TYPES = [
  "PLAYER_READY", "PLAY", "PAUSE", "PROGRESS", "SEEK", "ENDED",
  "PITCH_REACHED", "CHECKOUT_OPEN", "CHECKOUT_CLICK",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export class AcademyError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}
