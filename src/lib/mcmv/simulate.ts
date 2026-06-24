import { mcmvSimulationTable } from "./simulation-table";

export type SimulateMcmvInput = {
  nome?: string;
  renda: number;
  temFgts3Anos: boolean;
  temDependenteOuMaisDeUmComprador: boolean;
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function findClosestIncomeRow(renda: number) {
  const minIncome = mcmvSimulationTable[0]?.rendaLookup;
  const maxIncome = mcmvSimulationTable[mcmvSimulationTable.length - 1]?.rendaLookup;

  if (!minIncome || !maxIncome) {
    throw new Error("Tabela de simulação vazia.");
  }

  if (renda < minIncome || renda > maxIncome) {
    throw new Error(
      `A renda informada precisa estar entre ${formatCurrency(minIncome)} e ${formatCurrency(maxIncome)}.`
    );
  }

  return mcmvSimulationTable.reduce((closest, current) => {
    const closestDiff = Math.abs(closest.rendaLookup - renda);
    const currentDiff = Math.abs(current.rendaLookup - renda);

    if (currentDiff === closestDiff) {
      return current.rendaLookup < closest.rendaLookup ? current : closest;
    }

    return currentDiff < closestDiff ? current : closest;
  });
}

export function simulateMcmv(input: SimulateMcmvInput) {
  const row = findClosestIncomeRow(input.renda);

  const temDependente = input.temDependenteOuMaisDeUmComprador;
  const temFgts = input.temFgts3Anos;

  const subsidio = temDependente
    ? row.subsidioComDependente
    : row.subsidioSemDependente;

  const financiamento = temFgts
    ? row.financiamentoComFgts3Anos
    : row.financiamentoSemFgts3Anos;

  const parcelaFinanciamento = temFgts
    ? row.parcelaComFgts3Anos
    : row.parcelaSemFgts3Anos;

  let valorEstimadoTotal: number;

  if (temDependente && temFgts) {
    valorEstimadoTotal = row.creditoTotalComDependenteFgts;
  } else if (!temDependente && temFgts) {
    valorEstimadoTotal = row.creditoTotalSemDependenteFgts;
  } else if (temDependente && !temFgts) {
    valorEstimadoTotal = row.creditoTotalComDependenteSemFgts;
  } else {
    valorEstimadoTotal = row.creditoTotalSemDependenteSemFgts;
  }

  const valorImovelPossivel = valorEstimadoTotal / 0.8;
  const entrada20 = valorImovelPossivel * 0.2;

  const parcelaEntrada30x = entrada20 / 30;
  const parcelaEntrada60x = entrada20 / 60;
  const parcelaEntrada90x = entrada20 / 90;

  const parcelaTotal30x = parcelaFinanciamento + parcelaEntrada30x;
  const parcelaTotal60x = parcelaFinanciamento + parcelaEntrada60x;
  const parcelaTotal90x = parcelaFinanciamento + parcelaEntrada90x;

  return {
    nome: input.nome?.trim() || null,

    rendaInformada: input.renda,
    rendaConsiderada: row.rendaLookup,

    temFgts3Anos: temFgts,
    temDependenteOuMaisDeUmComprador: temDependente,

    subsidio,
    financiamento,
    parcelaFinanciamento,

    valorEstimadoTotal,
    valorImovelPossivel,
    entrada20,

    parcelaEntrada30x,
    parcelaEntrada60x,
    parcelaEntrada90x,

    parcelaTotal30x,
    parcelaTotal60x,
    parcelaTotal90x,

    formatted: {
      rendaInformada: formatCurrency(input.renda),
      rendaConsiderada: formatCurrency(row.rendaLookup),

      subsidio: formatCurrency(subsidio),
      financiamento: formatCurrency(financiamento),
      parcelaFinanciamento: formatCurrency(parcelaFinanciamento),

      valorEstimadoTotal: formatCurrency(valorEstimadoTotal),
      valorImovelPossivel: formatCurrency(valorImovelPossivel),
      entrada20: formatCurrency(entrada20),

      parcelaEntrada30x: formatCurrency(parcelaEntrada30x),
      parcelaEntrada60x: formatCurrency(parcelaEntrada60x),
      parcelaEntrada90x: formatCurrency(parcelaEntrada90x),

      parcelaTotal30x: formatCurrency(parcelaTotal30x),
      parcelaTotal60x: formatCurrency(parcelaTotal60x),
      parcelaTotal90x: formatCurrency(parcelaTotal90x),
    },
  };
}