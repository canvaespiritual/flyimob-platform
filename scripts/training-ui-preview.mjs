// Isolated localhost preview using the actual React component and synthetic API data.
// Not a Next route, not shipped in the app, no session/database/upstream access.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const tsxRequire = createRequire(require.resolve('tsx/package.json'));
const { build } = tsxRequire('esbuild');
const bundle = await build({ stdin: { contents: 'import React from "react";import {createRoot} from "react-dom/client";import Training from "./src/components/training/Training";createRoot(document.getElementById("app")).render(<Training/>);', loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
const cssDir = resolve('.next/static/chunks');
const css = (await Promise.all((await readdir(cssDir)).filter(name => name.endsWith('.css')).map(name => readFile(resolve(cssDir, name), 'utf8')))).join('\n');
let position = 24, revoked = false;
const course = { id: 'synthetic-course', title: 'Curso Iniciação Flyimob — prévia sintética', description: 'Teste local de interface; sem matrícula real.', modules: [{ id: 'synthetic-module', title: 'Introdução ao mercado imobiliário', lessons: [{ id: 'synthetic-lesson', title: 'Primeira aula — simulação local', videoSource: 'PRIVATE', progress: [] }] }] };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3106');
  res.setHeader('Cache-Control', 'no-store');
  const json = (body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (url.pathname === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
  if (url.pathname === '/api/training/courses') { json({ data: revoked ? [] : [course], lastLessonId: 'synthetic-lesson' }); return; }
  if (url.pathname === '/api/training/lessons/synthetic-lesson/playback') { json(revoked ? { error: 'access_revoked' } : { source: 'PRIVATE', sessionId: 'synthetic-playback', revision: 'synthetic-revision', url: '/fixture-video.mp4', position, percent: 25, metadata: { duration: 35 } }, revoked ? 403 : 200); return; }
  if (url.pathname === '/api/training/lessons/synthetic-lesson/progress') {
    if (revoked) { json({ error: 'access_revoked' }, 403); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const data = JSON.parse(raw); position = data.position;
    json({ position, percent: Math.min(100, position / 35 * 100), completed: position >= 34 }); return;
  }
  if (url.pathname === '/fixture-revoke') { revoked = true; json({ revoked: true, syntheticOnly: true }); return; }
  if (url.pathname === '/fixture-status') { json({ position, revoked, syntheticOnly: true }); return; }
  if (url.pathname === '/fixture-video.mp4') {
    // Existing technical sample; never copies or downloads any real lesson/video.
    const clip = await readFile(resolve('../EAD/.railway/horizonte-teste.mp4'));
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'bytes');
    if (match) { const start = Number(match[1]), end = Math.min(match[2] ? Number(match[2]) : clip.length - 1, clip.length - 1); res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${clip.length}`); res.setHeader('Content-Length', end - start + 1); res.end(clip.subarray(start, end + 1)); } else { res.setHeader('Content-Length', clip.length); res.end(clip); }
    return;
  }
  if (url.pathname !== '/') { json({ error: 'fixture_not_found' }, 404); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body><p style="padding:12px;background:#fff4dd">PRÉVIA LOCAL SINTÉTICA · Sem produção ou conta real</p><main id="app" style="padding:16px;max-width:1200px;margin:auto"></main><script src="/fixture.js"></script></body></html>');
});
server.listen(3106, '127.0.0.1', () => console.log('Synthetic UI preview: http://localhost:3106 (no production connections)'));
