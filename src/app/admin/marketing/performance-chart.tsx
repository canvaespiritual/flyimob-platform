"use client";
import {useState} from 'react';
export type ChartPoint={date:string;spend:string;leads:number;available:boolean;partial?:boolean};
export function PerformanceChart({points,previous=[],currency,label}:{points:ChartPoint[];previous?:ChartPoint[];currency:string;label:string}){
 const [focus,setFocus]=useState<number|null>(null);
 const all=[...points,...previous],moneyMax=Math.max(1,...all.map(p=>Number(p.spend))),leadsMax=Math.max(1,...all.map(p=>p.leads));
 const count=Math.max(points.length,previous.length,2),x=(i:number)=>65+i*690/(count-1),y=(v:number,max:number)=>240-200*v/max;
 function paths(data:ChartPoint[],field:'spend'|'leads'){
  let active=false;return data.map((p,i)=>{if(!p.available){active=false;return '';}const result=`${active?'L':'M'}${x(i)},${y(Number(p[field]),field==='spend'?moneyMax:leadsMax)}`;active=true;return result;}).join(' ');
 }
 const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(v);
 const selected=focus===null?undefined:points[focus],old=focus===null?undefined:previous[focus];
 return <figure className="rounded-xl border bg-white p-4">
  <figcaption className="mb-3 font-medium">{label}</figcaption>
  <p className="text-sm text-slate-600">Investimento: verde, eixo esquerdo · Leads Meta: azul, eixo direito · Período anterior: tracejado</p>
  <svg viewBox="0 0 820 290" role="img" aria-label={label} className="w-full min-w-0">
   {[0,1,2,3,4].map(i=><g key={i}><line x1="65" x2="755" y1={240-i*50} y2={240-i*50} stroke="#e2e8f0"/><text x="60" y={244-i*50} textAnchor="end" fontSize="10" fill="#0f766e">{money(moneyMax*i/4)}</text><text x="762" y={244-i*50} fontSize="10" fill="#2563eb">{Math.round(leadsMax*i/4)}</text></g>)}
   {[{data:points,dash:undefined},{data:previous,dash:'6 5'}].map(({data,dash},index)=><g key={index}><path d={paths(data,'spend')} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeDasharray={dash}/><path d={paths(data,'leads')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray={dash}/>{data.map((p,i)=>p.available&&!data[i-1]?.available&&!data[i+1]?.available?<g key={i}><circle cx={x(i)} cy={y(Number(p.spend),moneyMax)} r="4" fill="#0f766e"/><circle cx={x(i)} cy={y(p.leads,leadsMax)} r="4" fill="#2563eb"/></g>:null)}</g>)}
   {points.map((p,i)=><g key={p.date}><rect x={x(i)-Math.max(3,345/count)} y="30" width={Math.max(6,690/count)} height="215" fill="transparent" tabIndex={0} role="button" aria-label={`${p.date}: ${p.available?`${money(Number(p.spend))}, ${p.leads} leads`:'sem cobertura completa'}`} onMouseEnter={()=>setFocus(i)} onFocus={()=>setFocus(i)} onClick={()=>setFocus(i)}/>{(i===0||i===points.length-1||i===Math.floor(points.length/2))&&<text x={x(i)} y="268" textAnchor="middle" fontSize="11">{p.date}</text>}</g>)}
  </svg>
  <div aria-live="polite" className="min-h-12 text-sm text-slate-700">{selected?`${selected.date}: ${selected.available?`${money(Number(selected.spend))} · ${selected.leads} leads`:'Sem dados sincronizados'}${selected.partial?' · cobertura incompleta':''}${old?` | Anterior ${old.date}: ${old.available?`${money(Number(old.spend))} · ${old.leads} leads`:'sem dados sincronizados'}${old.partial?' (parcial)':''}`:''}`:'Passe o cursor ou use Tab para consultar os valores. Consulte a tabela para os dias sem cobertura.'}</div>
 </figure>;
}
