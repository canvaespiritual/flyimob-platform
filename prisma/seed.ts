// prisma/seed.ts
import { PrismaClient, TenantType, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth.server";

const prisma = new PrismaClient();

async function main() {
  /**
   * ===============================
   * TENANT PLATAFORMA (OWNER-GLOBAL)
   * ===============================
   */
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: "flyimob" },
    update: { isPlatform: true },
    create: {
      name: "FlyImob Platform",
      slug: "flyimob",
      type: TenantType.IMOBILIARIA,
      isPlatform: true,
    },
  });

  /**
   * OWNER-GLOBAL (PLATAFORMA)
   */
  const platformOwnerEmail = "contato.flyimob@gmail.com";
  const platformOwnerPassword = "Crailgra272";
  const platformOwnerHash = await hashPassword(platformOwnerPassword);

  await prisma.user.upsert({
    where: { email: platformOwnerEmail },
    update: {
      tenantId: platformTenant.id,
      role: UserRole.OWNER,
      name: "FlyImob Platform Owner",
      isActive: true,
      passwordHash: platformOwnerHash,
    },
    create: {
      tenantId: platformTenant.id,
      email: platformOwnerEmail,
      name: "FlyImob Platform Owner",
      role: UserRole.OWNER,
      isActive: true,
      passwordHash: platformOwnerHash,
    },
  });

  /**
   * ===============================
   * TENANT OPERAÇÃO (BRASÍLIA)
   * ===============================
   */
  const brasiliaTenant = await prisma.tenant.upsert({
    where: { slug: "fly-imob-brasilia" },
    update: {},
    create: {
      name: "FlyImob Brasília",
      slug: "fly-imob-brasilia",
      type: TenantType.IMOBILIARIA,
      parentId: platformTenant.id,
      isPlatform: false,
    },
  });

  /**
   * OWNER DA FRANQUIA BRASÍLIA
   */
  const brasiliaOwnerEmail = "gustavopradoc@gmail.com";
  const brasiliaOwnerPassword =
    process.env.OWNER_PASSWORD || "Crailgra272";
  const brasiliaOwnerHash = await hashPassword(brasiliaOwnerPassword);

  await prisma.user.upsert({
    where: { email: brasiliaOwnerEmail },
    update: {
      tenantId: brasiliaTenant.id,
      role: UserRole.OWNER,
      name: "Admin FlyImob Brasília",
      isActive: true,
      passwordHash: brasiliaOwnerHash,
    },
    create: {
      tenantId: brasiliaTenant.id,
      email: brasiliaOwnerEmail,
      name: "Admin FlyImob Brasília",
      role: UserRole.OWNER,
      isActive: true,
      passwordHash: brasiliaOwnerHash,
    },
  });

  console.log("✅ Seed concluído com sucesso:");
  console.log({
    platformTenant: platformTenant.slug,
    platformOwner: platformOwnerEmail,
    brasiliaTenant: brasiliaTenant.slug,
    brasiliaOwner: brasiliaOwnerEmail,
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
