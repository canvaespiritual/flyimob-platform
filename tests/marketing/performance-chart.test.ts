import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PerformanceChart} from '../../src/app/admin/marketing/performance-chart';
test('gráfico renderiza eixos independentes e comparação tracejada sem NaN',()=>{
 const html=renderToStaticMarkup(createElement(PerformanceChart,{currency:'BRL',label:'Evolução',points:[{date:'2026-05-11',spend:'100.10',leads:10,available:true}],previous:[{date:'2026-05-04',spend:'200',leads:5,available:true}]}));
 assert.match(html,/stroke-dasharray="6 5"/);assert.match(html,/eixo esquerdo/);assert.match(html,/eixo direito/);assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/tabindex="0"/);
});
test('dias ausentes não são desenhados como zeros e período vazio é seguro',()=>{
 const html=renderToStaticMarkup(createElement(PerformanceChart,{currency:'BRL',label:'Sem cobertura',points:[{date:'2026-05-11',spend:'0.00',leads:0,available:false}]}));
 assert.match(html,/d=""/);assert.match(html,/sem cobertura completa/);assert.doesNotMatch(html,/NaN|Infinity/);
 assert.doesNotThrow(()=>renderToStaticMarkup(createElement(PerformanceChart,{currency:'BRL',label:'Sem registros',points:[]})));
});
test('pontos isolados entre lacunas continuam visíveis sem conectar dias desconhecidos',()=>{
 const html=renderToStaticMarkup(createElement(PerformanceChart,{currency:'BRL',label:'Dados parciais',points:[{date:'2026-05-11',spend:'10',leads:2,available:true},{date:'2026-05-12',spend:'0',leads:0,available:false},{date:'2026-05-13',spend:'20',leads:3,available:true}]}));
 assert.equal((html.match(/<circle /g)??[]).length,4);
 assert.doesNotMatch(html,/d="[^"]*L/);
});
