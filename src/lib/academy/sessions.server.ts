import { AcademyError, LIMITS } from "./limits";
import { isOpaqueToken, isSessionExpired, newOpaqueToken, tokenHash } from "./identity.server";
import { academyTransaction } from "./transaction.server";
import { assertSessionContext, type SessionInput } from "./validation";

export async function startSession(input: SessionInput, visitorCookie: string | undefined, resumeToken: string | null) {
  return academyTransaction(async (tx) => {
    const now = new Date();
    let visitorToken = visitorCookie;
    let visitor = isOpaqueToken(visitorToken)
      ? await tx.academyVisitor.findUnique({ where: { identityTokenHash: tokenHash(visitorToken) } }) : null;
    if (resumeToken) {
      if (!visitor) throw new AcademyError(401, "invalid_collector_credentials");
      const session = await tx.academySession.findUnique({ where: { collectorTokenHash: tokenHash(resumeToken) } });
      if (!session || session.visitorId !== visitor.id) throw new AcademyError(401, "invalid_collector_credentials");
      assertSessionContext(session, input);
      if (!isSessionExpired(session, now)) {
        await tx.academySession.update({ where: { id: session.id }, data: { lastActivityAt: now } });
        await tx.academyVisitor.update({ where: { id: visitor.id }, data: { lastSeenAt: now } });
        return {
          visitorToken: visitorToken!, collectorToken: resumeToken, sessionId: session.id,
          expiresAt: session.expiresAt, resumed: true,
          nextSequence: await nextSequence(tx, session.id),
        };
      }
    }
    if (!visitor) {
      visitorToken = newOpaqueToken();
      visitor = await tx.academyVisitor.create({ data: { identityTokenHash: tokenHash(visitorToken), lastSeenAt: now } });
    } else await tx.academyVisitor.update({ where: { id: visitor.id }, data: { lastSeenAt: now } });
    const collectorToken = newOpaqueToken();
    const session = await tx.academySession.create({ data: {
      visitorId: visitor.id, collectorTokenHash: tokenHash(collectorToken), funnelKey: input.funnelKey,
      vslKey: input.vslKey, videoId: input.videoId,
      ...input.attribution, startedAt: now, lastActivityAt: now,
      expiresAt: new Date(now.getTime() + LIMITS.sessionMs),
    } });
    return { visitorToken: visitorToken!, collectorToken, sessionId: session.id, expiresAt: session.expiresAt, resumed: false, nextSequence: 0 };
  });
}

async function nextSequence(tx: import("@prisma/client").Prisma.TransactionClient, sessionId: string) {
  const latest = await tx.academyEvent.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  return (latest?.sequence ?? -1) + 1;
}
