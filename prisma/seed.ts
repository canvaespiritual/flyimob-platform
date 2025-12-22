// prisma/seed.ts
import { PrismaClient, TenantType, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth.server";

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = "flyimob";

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: {
      name: "FlyImob",
      slug: tenantSlug,
      type: TenantType.IMOBILIARIA,
    },
  });

  const ownerEmail = "gustavopradoc@gmail.com";
  const ownerPass = process.env.OWNER_PASSWORD || "";

  if (!ownerPass) {
    console.log("⚠️ OWNER_PASSWORD vazio. Não vou setar senha.");
  }

  const ownerHash = ownerPass ? await hashPassword(ownerPass) : null;

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      tenantId: tenant.id,
      role: UserRole.OWNER,
      name: "Admin FlyImob",
      ...(ownerHash ? { passwordHash: ownerHash } : {}),
    },
    create: {
      tenantId: tenant.id,
      email: ownerEmail,
      name: "Admin FlyImob",
      role: UserRole.OWNER,
      passwordHash: ownerHash,
    },
  });

  console.log("✅ Seed concluído:", { tenant: tenant.slug, ownerEmail });
}

main()
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
