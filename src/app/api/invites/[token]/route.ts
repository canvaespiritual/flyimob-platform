import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

 const inv = await prisma.userInviteToken.findUnique({
  where: { token },
  select: {
    email: true,
    role: true,
    tenantId: true,
    expiresAt: true,
    usedAt: true,
  },
});

if (!inv) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
if (inv.usedAt) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
if (inv.expiresAt < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

return NextResponse.json({
  ok: true,
  invite: {
    email: inv.email,
    role: inv.role,
    tenantId: inv.tenantId,
    tenantType: null,
    expiresAt: inv.expiresAt,
  },
});

}
