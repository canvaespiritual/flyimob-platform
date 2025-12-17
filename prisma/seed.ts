import { PrismaClient, TenantType, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = "flyimob";

  // 1) Tenant FlyImob (idempotente)
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: {
      name: "FlyImob",
      slug: tenantSlug,
      type: TenantType.IMOBILIARIA,
    },
  });

  // 2) Usuário OWNER (idempotente)
  // Troque email/nome pelos seus (ou deixa assim e ajusta depois)
  const ownerEmail = "gustavopradoc@gmail.com";

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      tenantId: tenant.id,
      role: UserRole.OWNER,
      name: "Admin FlyImob",
    },
    create: {
      tenantId: tenant.id,
      email: ownerEmail,
      name: "Admin FlyImob",
      role: UserRole.OWNER,
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
