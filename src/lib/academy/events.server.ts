import { AcademyError, LIMITS } from "./limits";
import { isOpaqueToken, isSessionExpired, tokenHash } from "./identity.server";
import { eventMetrics, retainOneShotPitch, watchMetrics } from "./metrics";
import { eventPayloadHash, newEvents } from "./idempotency";
import { academyTransaction } from "./transaction.server";
import type { EventInput } from "./validation";

export async function collectEvents(events: EventInput[], collectorToken: string, visitorCookie: string | undefined) {
  if (!isOpaqueToken(visitorCookie)) throw new AcademyError(401, "invalid_collector_credentials");
  const identityTokenHash = tokenHash(visitorCookie);
  return academyTransaction(async (tx) => {
    const now = new Date();
    const session = await tx.academySession.findFirst({ where: {
      collectorTokenHash: tokenHash(collectorToken), visitor: { identityTokenHash },
    } });
    if (!session) throw new AcademyError(401, "invalid_collector_credentials");
    if (isSessionExpired(session, now)) throw new AcademyError(410, "session_expired");

    // Serialize writes to this session; retry the full transaction after a conflict.
    await tx.academySession.update({ where: { id: session.id }, data: { lastActivityAt: now } });
    const existing = await tx.academyEvent.findMany({ where: { sessionId: session.id, OR: [
      { eventKey: { in: events.map((event) => event.eventKey) } },
      { sequence: { in: events.map((event) => event.sequence) } },
    ] }, select: { eventKey: true, sequence: true, payloadHash: true } });
    let fresh = newEvents(events, existing);
    // PITCH_REACHED is a session milestone, never a repeated progress marker.
    // Keep the first accepted occurrence and treat later occurrences as duplicates.
    fresh = retainOneShotPitch(fresh, Boolean(session.pitchReachedAt));
    const earliest = session.startedAt.getTime() - LIMITS.clockSkewMs;
    for (const event of fresh) {
      if (event.clientAt.getTime() < earliest || event.ranges.some((range) => range.observedStartAt.getTime() < earliest)) {
        throw new AcademyError(400, "observation_before_session");
      }
    }

    const incomingRanges = fresh.flatMap((event) => event.ranges.map((range) => ({ ...range, eventKey: event.eventKey })));
    const existingRanges = await tx.academyWatchRange.findMany({ where: { sessionId: session.id }, select: {
      rangeKey: true, startMs: true, endMs: true, observedStartAt: true, observedEndAt: true,
    } });
    const rangeKeys = new Set(existingRanges.map((range) => range.rangeKey));
    if (incomingRanges.some((range) => rangeKeys.has(range.rangeKey))) throw new AcademyError(409, "range_key_conflict");
    const count = await tx.academyEvent.count({ where: { sessionId: session.id } });
    if (count + fresh.length > LIMITS.eventsPerSession || existingRanges.length + incomingRanges.length > LIMITS.rangesPerSession) {
      throw new AcademyError(429, "session_capacity_reached");
    }

    if (fresh.length) await tx.academyEvent.createMany({ data: fresh.map((event) => ({
      sessionId: session.id, eventKey: event.eventKey, sequence: event.sequence, type: event.type,
      clientAt: event.clientAt, receivedAt: now, positionSecond: event.positionSecond,
      metadata: event.metadata, payloadHash: eventPayloadHash(event),
    })) });
    if (incomingRanges.length) await tx.academyWatchRange.createMany({ data: incomingRanges.map((range) => ({ ...range, sessionId: session.id, receivedAt: now })) });

    const metrics = { ...eventMetrics(session, fresh), ...watchMetrics([...existingRanges, ...incomingRanges]) };
    await tx.academySession.update({ where: { id: session.id }, data: metrics });
    await tx.academyVisitor.update({ where: { id: session.visitorId }, data: { lastSeenAt: now } });
    return { accepted: fresh.length, duplicates: events.length - fresh.length, metrics };
  });
}
