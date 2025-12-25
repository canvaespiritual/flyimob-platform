/* scripts/move-tenant-data.js */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const FROM_SLUG = "flyimob";          // plataforma (onde seus dados estão hoje)
  const TO_SLUG = "flyimob-brasilia";   // novo tenant regional

  const from = await prisma.tenant.findUnique({ where: { slug: FROM_SLUG } });
  if (!from) throw new Error("FROM tenant not found");

  const to = await prisma.tenant.upsert({
    where: { slug: TO_SLUG },
    update: {},
    create: {
      name: "FlyImob Brasília",
      slug: TO_SLUG,
      type: "IMOBILIARIA",
      parentId: from.id,        // ✅ hierarquia (opcional, mas recomendado)
      isPlatform: false,
    },
  });

  // Move: construtoras/empreendimentos/comparativos/inviteTokens/users (menos o platform owner, se quiser)
  await prisma.construtora.updateMany({ where: { tenantId: from.id }, data: { tenantId: to.id } });
  await prisma.empreendimento.updateMany({ where: { tenantId: from.id }, data: { tenantId: to.id } });
  await prisma.comparativo.updateMany({ where: { tenantId: from.id }, data: { tenantId: to.id } });
  await prisma.userInviteToken.updateMany({ where: { tenantId: from.id }, data: { tenantId: to.id } });

  // ⚠️ USERS: você decide:
  // - OU move todos
  // - OU mantém o OWNER-GLOBAL no tenant plataforma e move só equipe regional
  // Aqui vou mover todos EXCETO quem for o platform owner (ajuste o email abaixo).
  const PLATFORM_OWNER_EMAIL = process.env.PLATFORM_OWNER_EMAIL || "";

  await prisma.user.updateMany({
    where: {
      tenantId: from.id,
      ...(PLATFORM_OWNER_EMAIL ? { NOT: { email: PLATFORM_OWNER_EMAIL } } : {}),
    },
    data: { tenantId: to.id },
  });

  console.log("OK. Data moved to:", TO_SLUG);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
