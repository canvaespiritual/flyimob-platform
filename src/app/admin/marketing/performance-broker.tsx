"use client";
import type {PerformanceReport} from '@/lib/marketing/performance.server';
import {PerformanceChart} from './performance-chart';
type Broker=PerformanceReport['current']['brokers'][number];
export function BrokerEvolution({broker,currency,cost,partial}:{broker:Broker;currency:string;cost:'metaSpend'|'effectiveSpend';partial:boolean}){
 const money=(v:string|null)=>v===null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(Number(v));
 return <div className="space-y-4">{(['weekly','monthly'] as const).map(group=><div key={group} className="space-y-3">
  <PerformanceChart points={broker[group].map(p=>({date:p.date,spend:p[cost],leads:p.leads,available:p.rows>0,partial}))} currency={currency} label={`${broker.name} · ${group==='weekly'?'Evolução semanal':'Evolução mensal'} · registros confirmados`}/>
  <table className="w-full text-left text-sm"><thead><tr><th>Início do grupo</th><th>Investimento</th><th>Leads</th><th>CPL</th></tr></thead><tbody>{broker[group].map(p=><tr key={p.date}><td>{p.date}</td><td>{money(p[cost])}</td><td>{p.leads}</td><td>{money(p[cost==='metaSpend'?'cplMeta':'cplEffective'])}</td></tr>)}</tbody></table>
 </div>)}</div>;
}
