"use client";
import { useId, useState } from 'react';

export function MultiFilter({name,label,options,kind}:{name:string;label:string;options:{id:string;name:string}[];kind:'contas'|'responsáveis'}) {
  const id=useId(),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState('');
  const names=selected.map(value=>options.find(option=>option.id===value)?.name??value);
  const summary=!selected.length?'Todas (sem restrição)':kind==='contas'?`${selected.length} ${selected.length===1?'conta selecionada':'contas selecionadas'}`:`${names.slice(0,2).join(', ')}${names.length>2?` +${names.length-2}`:''}`;
  const visible=options.filter(option=>option.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="min-w-0 text-sm"><span id={id}>{label}</span>{selected.map(value=><input key={value} type="hidden" name={name} value={value}/>)}
    <details className="relative mt-1 rounded-lg border border-slate-300 bg-white"><summary aria-labelledby={id} className="cursor-pointer truncate px-3 py-2" title={summary}>{summary}</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-64 rounded-lg border bg-white p-3 shadow-lg">
        <input aria-label={`Buscar ${label}`} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar opções" className="mb-2 w-full rounded border px-2 py-1"/>
        <div className="mb-2 flex flex-wrap gap-2"><button type="button" className="underline" onClick={()=>setSelected(options.map(option=>option.id))}>Selecionar todas</button><button type="button" className="underline" onClick={()=>setSelected([])}>Limpar seleção</button></div>
        <label className="flex gap-2 py-1"><input type="checkbox" checked={!selected.length} onChange={()=>setSelected([])}/>Todas (sem restrição)</label>
        <div className="max-h-56 overflow-y-auto">{visible.map(option=><label key={option.id} className="flex items-start gap-2 py-1"><input type="checkbox" checked={selected.includes(option.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,option.id]:current.filter(value=>value!==option.id))}/>{option.name}</label>)}{!visible.length&&<p className="py-2 text-slate-500">Nenhuma opção encontrada.</p>}</div>
      </div>
    </details>
  </div>;
}
