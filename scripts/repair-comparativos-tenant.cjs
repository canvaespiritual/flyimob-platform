const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) {
    console.error("❌ Tenant flyimob não encontrado.");
    process.exit(1);
  }

  // Ajusta TODOS os comparativos para o tenant flyimob (uma vez só)
  const result = await prisma.comparativo.updateMany({
    data: { tenantId: tenant.id },
  });

  console.log("✅ Comparativos ajustados:", result.count);
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
