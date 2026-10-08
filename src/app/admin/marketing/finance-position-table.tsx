import type { marketingLung } from "@/lib/marketing/finance-queries.server";
import { operationalRoles } from "@/lib/team/policy";

export function financeMoney(value:string|null|undefined,currency="BRL") {
 if(value==null)return "Indisponível";
 const negative=value.startsWith("-"),[whole,fraction=""]=value.replace(/^-/ ,"").split(".");
 const formatter=new Intl.NumberFormat("pt-BR",{style:"currency",currency});
 const digits=formatter.resolvedOptions().maximumFractionDigits ?? 2;
 const formatted=formatter.formatToParts(BigInt(whole)*(negative?-1n:1n)).map(part=>part.type==="fraction"?fraction.padEnd(digits,"0").slice(0,digits):part.value).join("");
 return negative&&BigInt(whole)===0n?`-${formatted}`:formatted;
}
export function financeDate(value:string) {
 const [year,month,date]=value.split("-");
 return `${date}/${month}/${year}`;
}
type PositionReport=Pick<Awaited<ReturnType<typeof marketingLung>>, "table"|"from"|"to">;
export function FinancePositionTable({report}:{report:PositionReport}) {
 const until=financeDate(report.to);
 const headings=["Responsável / função","Moeda","Aportes da origem no período",`Aportes da origem acumulados até ${until}`,`Ajustes acumulados até ${until}`,"Consumo no período",`Consumo acumulado até ${until}`,"Crédito destinado a beneficiários","Crédito recebido para mídia","Crédito líquido para mídia","Bonificação antecipada","Bonificação posterior","Perda reconhecida","Posição inicial do período","Obrigação recuperável","Financiamento a receber",`Posição econômica até ${until}`,"Média gasto Meta 7 dias até fim do período","Campanhas ativas hoje","Leads no período","CPL efetivo no período","Situação / crédito"];
 return <div className="rounded-xl border bg-white p-4 space-y-3 overflow-x-auto">
  <h3 className="font-semibold">Posição por responsável e origem</h3>
  <p className="text-sm text-slate-600">Período aplicado: {financeDate(report.from)} a {until}, incluindo os dois dias. O acumulado inclui o histórico importado anterior ao início do período.</p>
  <p className="text-xs text-slate-600">Crédito recebido não é aporte próprio. Posição econômica = crédito para mídia + financiamento a receber − obrigação recuperável. Crédito operacional soma a obrigação recuperável ao consumo sem cobertura; não some novamente essas colunas.</p>
  <table className="min-w-[1500px] w-full text-left text-sm"><thead><tr>{headings.map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
   <tbody>{report.table.map(r=><tr key={`${r.id}:${r.currency}`} className="border-t">
    <td className="p-2">{r.name}<p className="text-xs">{r.role?operationalRoles[r.role]:"Origem econômica"}{r.active?"":" · inativo"}</p></td><td>{r.currency}</td>
    <td>{financeMoney(r.periodContributions,r.currency)}</td><td>{financeMoney(r.contributions,r.currency)}</td><td>{financeMoney(r.adjustments,r.currency)}</td>
    <td>{financeMoney(r.periodConsumption,r.currency)}</td><td>{financeMoney(r.consumption,r.currency)}</td>
    <td>{financeMoney(r.fundingProvided,r.currency)}</td><td>{financeMoney(r.fundingReceived,r.currency)}</td><td>{financeMoney(r.mediaPosition,r.currency)}</td><td>{financeMoney(r.bonuses,r.currency)}</td><td>{financeMoney(r.forgiven,r.currency)}</td><td>{financeMoney(r.losses,r.currency)}</td><td>{financeMoney(r.openingPosition,r.currency)}</td><td>{financeMoney(r.outstandingDebt,r.currency)}</td><td>{financeMoney(r.receivable,r.currency)}</td>
    <td className={r.position.startsWith("-")?"text-red-700":"text-green-700"}>{financeMoney(r.position,r.currency)}{r.missing>0&&<p className="text-amber-700">{r.missing} métricas indisponíveis no acumulado</p>}</td>
    <td>{financeMoney(r.dailyMetaSpend,r.currency)}</td><td>{r.activeCampaigns}</td><td>{r.leads}</td><td>{financeMoney(r.cpl,r.currency)}</td>
    <td>{r.situation}<p>{financeMoney(r.operationalCredit,r.currency)}</p></td>
   </tr>)}</tbody></table>
 </div>;
}
