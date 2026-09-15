import { createHash } from "node:crypto";
import { AcademyError } from "./limits";
import type { EventInput } from "./validation";

function compareKeys(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareKeys(a, b)).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
export function eventPayloadHash(event: EventInput): string {
  return createHash("sha256").update(JSON.stringify(canonical({ ...event, ranges: [...event.ranges].sort((a, b) => compareKeys(a.rangeKey, b.rangeKey)) }))).digest("hex");
}

export function newEvents(events: EventInput[], existing: { eventKey: string; sequence: number; payloadHash: string }[]) {
  const byKey = new Map(existing.map((event) => [event.eventKey, event]));
  const bySequence = new Map(existing.map((event) => [event.sequence, event]));
  return events.filter((event) => {
    const previous = byKey.get(event.eventKey);
    if (previous) {
      if (previous.payloadHash !== eventPayloadHash(event)) throw new AcademyError(409, "event_key_conflict");
      return false;
    }
    if (bySequence.has(event.sequence)) throw new AcademyError(409, "event_sequence_conflict");
    return true;
  });
}
