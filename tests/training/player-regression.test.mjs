import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {horizonteFixture} from './horizonte-fixture.mjs';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('tsx/package.json'))('esbuild');
const {chromium}=createRequire(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright');
test('real React + Horizonte endpoints: minute-four seek, repeated Anterior/Próxima, reload after rejected progress, expiry, two tabs and revocation',async()=>{
 const fixture=await horizonteFixture();
 const bundle=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import Training from "./src/components/training/Training";createRoot(document.getElementById("app")).render(<Training/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
 const clip=await readFile(resolve(process.env.USERPROFILE,'Desktop/EAD/.railway/horizonte-teste.mp4'));
 const lessons=['first','second','future'].map(id=>({id,title:id,videoSource:'PRIVATE',progress:[]}));
 const server=createServer(async(req,res)=>{
  const json=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/clip.mp4'){res.setHeader('Content-Type','video/mp4');res.end(clip);return;}
  if(req.url==='/api/training/courses'){json({data:[{id:'course',title:'Curso Iniciação Flyimob',description:'synthetic',modules:[{id:'module',title:'Aulas',lessons}]}],lastLessonId:'second'});return;}
  const match=/^\/api\/training\/lessons\/(\w+)\/(playback|progress)$/.exec(req.url);
  if(match){let raw='';for await(const chunk of req)raw+=chunk;const response=await fixture.request(match[1],match[2],req.method,raw?JSON.parse(raw):undefined);const data=await response.json();if(!response.ok)data.error=(data.code||'request_failed').toLowerCase();json(data,response.status);return;}
  res.setHeader('Content-Type','text/html');res.end('<html><body><div id="app"></div><script src="/app.js"></script></body></html>');
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();
  await context.addInitScript(()=>{
   document.addEventListener('loadedmetadata',e=>{e.target.dataset.mediaLoaded='true';},true);
   const state=new WeakMap();const get=v=>{if(!state.has(v))state.set(v,{position:0,paused:true});return state.get(v);};
   Object.defineProperties(HTMLMediaElement.prototype,{duration:{get:()=>2707},readyState:{get:()=>4},paused:{get(){return get(this).paused;}},currentTime:{get(){return get(this).position;},set(value){get(this).position=value;this.dispatchEvent(new Event('seeking'));queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}}});
   HTMLMediaElement.prototype.play=function(){get(this).paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();};
   HTMLMediaElement.prototype.pause=function(){get(this).paused=true;this.dispatchEvent(new Event('pause'));};
   globalThis.advanceMedia=value=>{const v=document.querySelector('video');get(v).position=value;v.dispatchEvent(new Event('timeupdate'));};
  });
  const page=await context.newPage();await page.clock.install();const origin=`http://127.0.0.1:${server.address().port}`;
  const navigate=async(name,title)=>{await page.getByRole('button',{name,exact:true}).click();for(let i=0;i<40;i++){await page.clock.runFor(500);await new Promise(done=>setTimeout(done,20));if(await page.evaluate(t=>document.querySelector('section h2')?.textContent===t,title))return;}assert.fail(`navigation did not reach ${title}: ${JSON.stringify(fixture.state.requests.slice(-8))}; UI: ${await page.locator("body").innerText()}`);};
  const open=async(p=page)=>{await p.goto(origin);await p.clock.runFor(200);await p.getByRole('button',{name:'Curso Iniciação Flyimob'}).click();await p.getByRole('button',{name:'Continuar curso'}).click();await p.clock.runFor(200);await p.waitForFunction(()=>document.querySelector('video')?.dataset.mediaLoaded==='true');};
  await open();await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=240;return v.play();});await page.clock.runFor(4000);
  for(let i=0;i<4;i++){
   await navigate('Anterior','first');await page.clock.runFor(200);await page.waitForFunction(()=>document.querySelector('video')?.dataset.mediaLoaded==='true');
   await navigate('Próxima','second');await page.clock.runFor(200);await page.waitForFunction(()=>document.querySelector('video')?.currentTime===240);
  }
  assert.equal(fixture.state.progress.get('second').position,240);assert.equal(fixture.state.progress.get('second').watchedPercent,0);
  await page.reload();await page.getByRole('button',{name:'Curso Iniciação Flyimob'}).click();await page.getByRole('button',{name:'Continuar curso'}).click();await page.clock.runFor(200);await page.waitForFunction(()=>document.querySelector('video')?.currentTime===240);
  fixture.state.rejected=true;await page.evaluate(()=>document.querySelector('video').play());await page.clock.runFor(11000);await page.getByRole('status').filter({hasText:'progresso enviado foi recusado'}).waitFor();assert.equal(await page.evaluate(()=>document.querySelector('video').paused),false);
  fixture.state.rejected=false;await open();await page.waitForFunction(()=>document.querySelector('video')?.currentTime===240);
  fixture.age(91000);await page.clock.runFor(11000);await page.clock.runFor(200);await page.waitForFunction(()=>document.querySelector('video')?.currentTime===240);
  const second=await context.newPage();await open(second);
  const opens=fixture.state.requests.filter(r=>r.method==='POST'&&r.action==='playback');assert.notEqual(opens.at(-1).body.contextId,opens.at(-2).body.contextId);
  await navigate('future','future');await page.clock.runFor(200);await page.waitForFunction(()=>document.querySelector('video')?.dataset.mediaLoaded==='true');
  fixture.state.revoked=true;await page.evaluate(()=>document.querySelector('video').play());await page.clock.runFor(11000);await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>document.querySelector('video').paused),true);
  assert.equal(fixture.state.progress.get('second').watchedPercent,0);
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
