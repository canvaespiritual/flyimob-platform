import * as XLSX from 'xlsx'
import { mkdirSync } from 'fs'
import path from 'path'

import { prisma } from '../../src/lib/prisma'

async function main() {
  console.log('🔎 Buscando tenant Goiás...')

  const tenant = await prisma.tenant.findFirst({
    where: {
      slug: 'flyimob-goiania'
    }
  })

  if (!tenant) {
    throw new Error('Tenant flyimob-goiania não encontrado.')
  }

  console.log('🏢 Buscando empreendimentos ativos...')

  const empreendimentos = await prisma.empreendimento.findMany({
    where: {
      tenantId: tenant.id,
      status: 'ATIVO'
    },
    include: {
      construtora: true,
      tipologias: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })

  const rows: Record<string, any>[] = []

  for (const empreendimento of empreendimentos) {
    for (const tipologia of empreendimento.tipologias) {
      rows.push({
        empreendimento: empreendimento.name,
        construtora: empreendimento.construtora?.name ?? '',
        cidade: empreendimento.cidade ?? '',
        bairro: empreendimento.bairro ?? '',
        quartos: tipologia.quartos ?? '',
        area_privativa_m2: tipologia.areaPrivativa ?? '',
        preco_inicial: tipologia.precoInicial ?? '',
        data_entrega: empreendimento.dataEntrega
          ? new Date(empreendimento.dataEntrega)
              .toLocaleDateString('pt-BR')
          : '',
        descricao: empreendimento.descricao ?? '',
        slug: empreendimento.slug ?? '',
        landing_page: empreendimento.slug
          ? `https://flyimob.com/empreendimentos/${empreendimento.slug}`
          : '',

        // ===== COLUNAS IA (VAZIAS) =====

        regiao_comercial: '',
        perfil_cliente: '',
        credito_minimo_indicado: '',
        credito_maximo_indicado: '',
        descricao_curta: '',
        gatilho_comercial: '',
        prioridade_oferta: '',
        comparativo_regiao_link: '',
        observacao_ia: ''
      })
    }
  }

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'catalogo_imoveis_goias'
  )

  const outputDir = path.resolve(process.cwd(), 'materials')

  mkdirSync(outputDir, {
    recursive: true
  })

  const outputPath = path.join(
    outputDir,
    'imoveis_goias.xlsx'
  )

  XLSX.writeFile(workbook, outputPath)

  console.log(`✅ Planilha criada: ${outputPath}`)
  console.log(`📦 ${rows.length} linhas exportadas`)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })