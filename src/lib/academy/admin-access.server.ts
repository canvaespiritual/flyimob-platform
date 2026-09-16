import { getSessionUser } from "@/lib/session.server";
import { AcademyError } from "./limits";
import { isAcademyAdmin } from "./push-policy";
import { academyError } from "./http.server";

export async function academyAccessResponse() {
  try { await academyAdmin(); return null; }
  catch (error) { return academyError(error); }
}

export async function academyAdmin() {
  const session = await getSessionUser();
  if (!session) throw new AcademyError(401, "authentication_required");
  if (!isAcademyAdmin(session.user.id)) throw new AcademyError(403, "academy_access_denied");
  return session.user;
}

export function assertAdminOrigin(request: Request) {
  const expected = process.env.ACADEMY_ADMIN_ORIGIN;
  if (!expected || request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AcademyError(403, "origin_not_allowed");
  }
}
