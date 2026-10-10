import { selectionIds } from "./filter-selection";
import { Prisma } from '@prisma/client';
import { day, MarketingError } from './policy';
import type { ReportRow } from './metrics.server';

export const dateText = (date: Date) => date.toISOString().slice(0, 10);
export function dates(from: string, to: string) {
 const result: string[] = [];
 for (let t=day(from).getTime(); t<=day(to).getTime(); t+=86400000) result.push(dateText(new Date(t)));
 return result;
}
export function comparisonRange(from: string, to: string) {
 const start=day(from), end=day(to), length=dates(from,to).length;
 if(start.getUTCDate()===1 && start.getUTCMonth()===end.getUTCMonth() && start.getUTCFullYear()===end.getUTCFullYear()) {
  const previousStart=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-1,1));
  const previousEnd=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),0));
  const full=end.getUTCDate()===new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
  return {from:dateText(previousStart),to:dateText(new Date(Date.UTC(previousStart.getUTCFullYear(),previousStart.getUTCMonth(),full?previousEnd.getUTCDate():Math.min(end.getUTCDate(),previousEnd.getUTCDate()))))};
 }
 return {from:dateText(new Date(start.getTime()-length*86400000)),to:dateText(new Date(start.getTime()-86400000))};
}
export function change(current: string | number | null, previous: string | number | null) {
 if(current===null||previous===null)return {absolute:null,percent:null};
 const c=new Prisma.Decimal(current),p=new Prisma.Decimal(previous);
 return {absolute:c.minus(p).toFixed(2),percent:p.isZero()?null:c.minus(p).div(p.abs()).times(100).toFixed(2)};
}
export function salesScope(params: URLSearchParams, enforcedPersonId?: string) {
 const ids=selectionIds(params,'personId');
 if(enforcedPersonId && ids.some(id=>id!==enforcedPersonId))throw new MarketingError(403,'Responsável fora do escopo autorizado.');
 return enforcedPersonId?[enforcedPersonId]:ids;
}
type Amount = {meta:Prisma.Decimal;effective:Prisma.Decimal;leads:number;unavailable:number;rows:number};
function empty():Amount{return {meta:new Prisma.Decimal(0),effective:new Prisma.Decimal(0),leads:0,unavailable:0,rows:0};}
function add(a:Amount,row:ReportRow){
 if(row.state!=='CONFIRMED'||row.metaSpend===null||row.effectiveSpend===null||row.leads===null){a.unavailable++;return;}
 a.meta=a.meta.plus(row.metaSpend);a.effective=a.effective.plus(row.effectiveSpend);a.leads+=row.leads;a.rows++;
}
function serialize(a:Amount,days:number){return {metaSpend:a.meta.toFixed(2),effectiveSpend:a.effective.toFixed(2),leads:a.leads,cplMeta:a.leads?a.meta.div(a.leads).toFixed(2):null,cplEffective:a.leads?a.effective.div(a.leads).toFixed(2):null,averageLeads:days?a.leads/days:0,unavailable:a.unavailable,rows:a.rows};}
export type PerformanceRow = ReportRow & {campaign:ReportRow['campaign'] & {accountId:string}};
export function performanceSeries(rows:PerformanceRow[],from:string,to:string,currency:string,personIds:string[]=[],isCovered:(accountId:string,date:string)=>boolean=()=>false,accountIds:string[]=[]) {
 const calendar=dates(from,to),selected=new Set(personIds),total=empty(),daily=new Map(calendar.map(d=>[d,empty()])),weekdays=Array.from({length:7},empty);
 const brokers=new Map<string,{id:string;name:string;amount:Amount;weekly:Map<string,Amount>;monthly:Map<string,Amount>}>();
 const seen=new Set<string>();
 for(const row of rows){
  const date=dateText(row.date);if(date<from||date>to||row.currency!==currency)continue;
  const assignment=row.campaign.assignments.find(a=>a.validFrom<=row.date&&(!a.validTo||row.date<a.validTo));
  const id=assignment?.brokerId??'unassigned';if(selected.size&&!selected.has(id))continue;
  const key=`${row.campaign.id}:${date}`;if(seen.has(key))throw new MarketingError(503,'Métrica duplicada no relatório.');seen.add(key);
  if(!brokers.has(id))brokers.set(id,{id,name:assignment?.broker.name??'Sem responsável',amount:empty(),weekly:new Map(),monthly:new Map()});
  const broker=brokers.get(id)!;const monday=new Date(row.date);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  for(const [map,group] of [[broker.weekly,dateText(monday)],[broker.monthly,date.slice(0,7)]] as const){if(!map.has(group))map.set(group,empty());add(map.get(group)!,row);}
  for(const amount of [total,daily.get(date)!,weekdays[row.date.getUTCDay()],broker.amount])add(amount,row);
 }
 let cumulative=empty();
 const series=calendar.map(date=>{
  const a=daily.get(date)!;cumulative={meta:cumulative.meta.plus(a.meta),effective:cumulative.effective.plus(a.effective),leads:cumulative.leads+a.leads,unavailable:cumulative.unavailable+a.unavailable,rows:cumulative.rows+a.rows};
  const covered=accountIds.length>0&&accountIds.every(id=>isCovered(id,date))&&a.unavailable===0;
  return {date,...serialize(a,1),covered,cumulative:serialize(cumulative,1)};
 });
 const groups=(map:Map<string,Amount>)=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([date,a])=>({date,...serialize(a,1)}));
 return {totals:serialize(total,calendar.length),series,weekdays:weekdays.map((a,index)=>({day:index,...serialize(a,calendar.filter(d=>day(d).getUTCDay()===index).length)})),brokers:[...brokers.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(b=>({id:b.id,name:b.name,...serialize(b.amount,calendar.length),weekly:groups(b.weekly),monthly:groups(b.monthly)})),complete:series.every(d=>d.covered)};
}
