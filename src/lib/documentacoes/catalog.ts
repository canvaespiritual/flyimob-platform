export const initialDocumentTypes = [
  ["RG_CPF", "RG/CPF"], ["COMPROVANTE_RESIDENCIA", "Comprovante de Residência"],
  ["CERTIDAO_ESTADO_CIVIL", "Certidão de Estado Civil"], ["CTPS", "CTPS"],
  ["COMPROVANTE_RENDA", "Comprovante de Renda"], ["AUTORIZACAO_CONSULTA_CPF", "Autorização para Consulta CPF"],
  ["CARTAO_CREDITO", "Cartão de Crédito"], ["DECLARACOES_DIVERSAS", "Declarações Diversas"],
  ["EXTRATOS_BANCARIOS_3_MESES", "03 Últimos Extratos Bancários"], ["CCMEI", "CCMEI"],
  ["CONTRATO_ESTAGIO", "Contrato de Estágio"], ["CONTRATO_SOCIAL", "Contrato Social"],
  ["IMPOSTO_RENDA", "Imposto de Renda"], ["DECLARACAO_CANCELAMENTO_CCA", "Declaração de Cancelamento CCA"],
  ["DECLARACAO_PARENTESCO", "Declaração de Parentesco"], ["ESOCIAL", "eSocial"],
  ["EXTRATO_PAGAMENTO_INSS", "Extrato de Pagamento do INSS"], ["EXTRATO_FGTS", "Extrato FGTS"],
  ["PRO_LABORE", "Pró-Labore"], ["OUTROS", "Outros"],
] as const;

export function initialCatalog(tenantId: string) {
  return initialDocumentTypes.map(([code, name], index) => ({ tenantId, code, name,
    sortOrder: index + 1, isActive: true, defaultRequired: false }));
}
