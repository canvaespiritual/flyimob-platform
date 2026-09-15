import { AcademyError, EVENT_TYPES, LIMITS, type EventType } from "./limits";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Metadata = { [key: string]: JsonValue };
export type WatchRangeInput = {
  rangeKey: string;
  startMs: number;
  endMs: number;
  observedStartAt: Date;
  observedEndAt: Date;
};
export type EventInput = {
  eventKey: string;
  sequence: number;
  type: EventType;
  clientAt: Date;
  positionSecond: number | null;
  metadata: Metadata;
  ranges: WatchRangeInput[];
};

function invalid(): never { throw new AcademyError(400, "invalid_payload"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim();
}
function key(value: unknown): string {
  const result = text(value, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(result)) invalid();
  return result;
}
function number(value: unknown, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid();
  return value;
}
function date(value: unknown, now: Date): Date {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value ||
      parsed.getTime() > now.getTime() + LIMITS.clockSkewMs ||
      parsed.getTime() < now.getTime() - LIMITS.sessionMs - LIMITS.clockSkewMs) invalid();
  return parsed;
}
function metadata(value: unknown): Metadata {
  const root = record(value ?? {});
  let nodes = 0;
  function visit(item: unknown, depth: number): void {
    if (++nodes > LIMITS.metadataNodes || depth > LIMITS.metadataDepth) invalid();
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") { text(item, 256); return; }
    if (typeof item === "number") { if (!Number.isFinite(item)) invalid(); return; }
    if (Array.isArray(item)) { item.forEach((child) => visit(child, depth + 1)); return; }
    const obj = record(item);
    for (const [name, child] of Object.entries(obj)) {
      if (!/^[A-Za-z0-9_:-]{1,64}$/.test(name) || ["__proto__", "prototype", "constructor"].includes(name)) invalid();
      visit(child, depth + 1);
    }
  }
  visit(root, 0);
  if (new TextEncoder().encode(JSON.stringify(root)).byteLength > LIMITS.metadataBytes) invalid();
  return root as Metadata;
}

const ATTRIBUTION_LIMITS = {
  source: 200, utmSource: 200, utmMedium: 200, utmCampaign: 200,
  utmContent: 200, utmTerm: 200, utmId: 200, fbclid: 500, fbp: 256,
  fbc: 512, campaignId: 120, adsetId: 120, adId: 120, landingPage: 2048, referrer: 2048,
  gclid: 500, wbraid: 500, gbraid: 500,
} as const;
export type Attribution = Partial<Record<keyof typeof ATTRIBUTION_LIMITS, string | null>>;
export type SessionInput = { funnelKey: string; vslKey: string | null; videoId: string | null; attribution: Attribution };

function optionalIdentifier(value: unknown, max: number): string | null {
  if (value == null) return null;
  const result = text(value, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(result)) invalid();
  return result;
}

export function assertSessionContext(session: Pick<SessionInput, "funnelKey" | "vslKey" | "videoId">, input: SessionInput): void {
  if (session.funnelKey !== input.funnelKey) throw new AcademyError(409, "funnel_mismatch");
  if (session.vslKey !== input.vslKey || session.videoId !== input.videoId) {
    throw new AcademyError(409, "vsl_context_mismatch");
  }
}

export function validateSession(value: unknown): SessionInput {
  const body = record(value);
  keys(body, ["funnelKey", "vslKey", "videoId", "attribution"]);
  const funnelKey = text(body.funnelKey, 80);
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(funnelKey)) invalid();
  const raw = record(body.attribution ?? {});
  keys(raw, Object.keys(ATTRIBUTION_LIMITS));
  const attribution: Attribution = {};
  for (const name of Object.keys(raw) as (keyof Attribution)[]) {
    const result = raw[name] == null ? "" : text(raw[name], ATTRIBUTION_LIMITS[name]);
    if ((name === "landingPage" || name === "referrer") && result) {
      let url: URL;
      try { url = new URL(result); } catch { invalid(); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) invalid();
      // UTMs have their own fields; never persist arbitrary query strings or fragments.
      attribution[name] = `${url.origin}${url.pathname}`;
      if (attribution[name]!.length > ATTRIBUTION_LIMITS[name]) invalid();
    } else attribution[name] = result || null;
  }
  return { funnelKey, vslKey: optionalIdentifier(body.vslKey, 80), videoId: optionalIdentifier(body.videoId, 200), attribution };
}

export function validateEvents(value: unknown, now = new Date()): EventInput[] {
  const body = record(value);
  keys(body, ["events"]);
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > LIMITS.eventsPerBatch) invalid();
  const eventKeys = new Set<string>();
  const sequences = new Set<number>();
  const rangeKeys = new Set<string>();
  return body.events.map((item): EventInput => {
    const raw = record(item);
    keys(raw, ["eventKey", "sequence", "type", "clientAt", "positionSecond", "metadata", "ranges"]);
    const eventKey = key(raw.eventKey);
    const sequence = number(raw.sequence, 2_147_483_647, true);
    if (eventKeys.has(eventKey) || sequences.has(sequence)) invalid();
    eventKeys.add(eventKey); sequences.add(sequence);
    if (!EVENT_TYPES.includes(raw.type as EventType)) invalid();
    const type = raw.type as EventType;
    const clientAt = date(raw.clientAt, now);
    const positionSecond = raw.positionSecond == null ? null : number(raw.positionSecond, LIMITS.maxVideoMs / 1000);
    if (["PLAY", "PAUSE", "PROGRESS", "SEEK", "ENDED", "PITCH_REACHED"].includes(type) && positionSecond === null) invalid();
    const rawRanges = raw.ranges ?? [];
    if (!Array.isArray(rawRanges)) invalid();
    if (rawRanges.length && !["PROGRESS", "PAUSE", "ENDED"].includes(type)) invalid();
    const ranges = rawRanges.map((item): WatchRangeInput => {
      const range = record(item);
      keys(range, ["rangeKey", "startMs", "endMs", "observedStartAt", "observedEndAt"]);
      const rangeKey = key(range.rangeKey);
      if (rangeKeys.has(rangeKey) || rangeKeys.size >= LIMITS.rangesPerBatch) invalid();
      rangeKeys.add(rangeKey);
      const startMs = number(range.startMs, LIMITS.maxVideoMs, true);
      const endMs = number(range.endMs, LIMITS.maxVideoMs, true);
      const observedStartAt = date(range.observedStartAt, now);
      const observedEndAt = date(range.observedEndAt, now);
      const elapsed = observedEndAt.getTime() - observedStartAt.getTime();
      if (endMs <= startMs || elapsed <= 0 || elapsed > LIMITS.maxObservationMs ||
          endMs - startMs > elapsed * LIMITS.maxPlaybackRate + 250 || observedEndAt > clientAt) invalid();
      return { rangeKey, startMs, endMs, observedStartAt, observedEndAt };
    });
    return { eventKey, sequence, type, clientAt, positionSecond, metadata: metadata(raw.metadata), ranges };
  });
}
