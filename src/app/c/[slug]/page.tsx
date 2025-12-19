import { prisma } from "../../../lib/prisma";
import ComparativoPublicClient from "./ui/ComparativoPublicClient";

export default async function PublicComparativoPage(
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
) {
  const { slug } = await Promise.resolve(params);

  if (!slug) {
    return <div className="p-6">Comparativo inválido.</div>;
  }

  const comparativo = await prisma.comparativo.findUnique({
    where: { slugPublico: slug },
    include: {
      items: {
        orderBy: { ordem: "asc" },
        include: {
          tipologia: {
            include: {
              empreendimento: {
                include: {
                  construtora: { select: { name: true } },
                  fotos: { orderBy: { ordem: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comparativo) {
    return <div className="p-6">Comparativo não encontrado.</div>;
  }

  return <ComparativoPublicClient comparativo={comparativo} />;
}
