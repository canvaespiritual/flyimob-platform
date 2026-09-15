import { AcademyError } from "./limits";
import { normalizeEmail, normalizeName, normalizePhone } from "./normalization";
import { isOpaqueToken, isSessionExpired, tokenHash } from "./identity.server";
import { academyTransaction } from "./transaction.server";

export function validateLead(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AcademyError(400, "invalid_payload");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["name", "email", "phone"].includes(key))) throw new AcademyError(400, "invalid_payload");
  return { name: normalizeName(body.name), email: normalizeEmail(body.email), phone: normalizePhone(body.phone) };
}

export async function upsertLead(input: { lead: { name: string; email: string; phone: string }; visitorToken: string; collectorToken: string }) {
  if (!isOpaqueToken(input.visitorToken) || !isOpaqueToken(input.collectorToken)) throw new AcademyError(401, "invalid_collector_credentials");
  return academyTransaction(async (tx) => {
    const session = await tx.academySession.findFirst({ where: {
      collectorTokenHash: tokenHash(input.collectorToken), visitor: { identityTokenHash: tokenHash(input.visitorToken) },
    }, include: { visitor: true } });
    if (!session || isSessionExpired(session, new Date())) throw new AcademyError(401, "invalid_collector_credentials");
    const existing = await tx.academyLead.findFirst({ where: { sessionId: session.id, email: input.lead.email, phone: input.lead.phone } });
    if (existing) return { lead: existing, created: false };
    const data = {
      session: { connect: { id: session.id } }, ...input.lead, funnelKey: session.funnelKey, vslKey: session.vslKey, videoId: session.videoId,
      utmSource: session.utmSource, utmMedium: session.utmMedium, utmCampaign: session.utmCampaign,
      utmContent: session.utmContent, utmTerm: session.utmTerm, utmId: session.utmId, fbclid: session.fbclid,
      fbp: session.fbp, fbc: session.fbc, gclid: session.gclid, wbraid: session.wbraid, gbraid: session.gbraid,
      campaignId: session.campaignId, adsetId: session.adsetId, adId: session.adId,
    };
    return { lead: await tx.academyLead.create({ data }), created: true };
  });
}
