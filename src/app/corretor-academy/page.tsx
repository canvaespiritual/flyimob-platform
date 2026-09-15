'use client';

import { createElement, FormEvent, useEffect, useRef, useState } from 'react';

const FUNNEL = 'corretor-academy';
const VSL = 'corretor-academy-v1';
const VIDEO = '6aa950430492aa379514a80b';
const PITCH = 2034;
const SCRIPT = 'https://scripts.converteai.net/ab0d5dbd-353e-4147-a5c6-52ab96121828/players/6aa950430492aa379514a80b/v4/player.js';
const CHECKOUT = 'https://pay.hotmart.com/C13699064X?off=a2itt7gi&offDiscount=PONTE';

declare global { interface Window { smartplayer?: { instances?: Array<{ on: (event: string, cb: (...args: unknown[]) => void) => void; video?: { currentTime?: number } }> } } }

type Session = { collectorToken: string; sessionId: string; pitchReachedAt?: string | null };

function queryAttribution() {
  const p = new URLSearchParams(window.location.search);
  const value = (key: string) => p.get(key) || null;
  return {
    source: value('source'), utmSource: value('utm_source'), utmMedium: value('utm_medium'), utmCampaign: value('utm_campaign'),
    utmContent: value('utm_content'), utmTerm: value('utm_term'), utmId: value('utm_id'), fbclid: value('fbclid'),
    fbp: value('fbp') || document.cookie.match(/(?:^|; )_fbp=([^;]+)/)?.[1] || null,
    fbc: value('fbc') || document.cookie.match(/(?:^|; )_fbc=([^;]+)/)?.[1] || null,
    gclid: value('gclid'), wbraid: value('wbraid'), gbraid: value('gbraid'), campaignId: value('campaignId'),
    adsetId: value('adsetId'), adId: value('adId'), landingPage: window.location.href, referrer: document.referrer || null,
  };
}

export default function CorretorAcademyPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [pitch, setPitch] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lead, setLead] = useState({ name: '', email: '', phone: '' });
  const [message, setMessage] = useState('');
  const seq = useRef(0); const lastSecond = useRef(0); const queue = useRef<Array<Record<string, unknown>>>([]); const flushTimer = useRef<number | null>(null); const wired = useRef(false); const pitchReached = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/academy/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ funnelKey: FUNNEL, vslKey: VSL, videoId: VIDEO, attribution: queryAttribution() }) })
    .then((r) => r.json()).then((data) => { if (active && data.ok) { setSession(data); pitchReached.current = Boolean(data.pitchReachedAt); setPitch(pitchReached.current); } });
    const script = document.createElement('script'); script.src = SCRIPT; script.async = true; document.body.appendChild(script);
    return () => { active = false; script.remove(); if (flushTimer.current !== null) window.clearTimeout(flushTimer.current); };
  }, []);

  function enqueue(type: string, position: number | null, ranges: unknown[] = [], metadata: Record<string, unknown> = {}) {
    if (!session) return;
    queue.current.push({ eventKey: `${type.toLowerCase()}-${Date.now()}-${seq.current}`, sequence: seq.current++, type, clientAt: new Date().toISOString(), positionSecond: position, metadata, ranges });
    if (flushTimer.current === null) flushTimer.current = window.setTimeout(() => { flushTimer.current = null; void flush(); }, 1000);
  }
  async function flush() { flushTimer.current = null; if (!session || !queue.current.length) return; const events = queue.current.splice(0); await fetch('/api/academy/events', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.collectorToken}` }, body: JSON.stringify({ events }) }); }

  useEffect(() => {
    if (!session) return;
    const onReady = () => {
      const player = window.smartplayer?.instances?.[0]; if (!player || wired.current) return; wired.current = true;
      enqueue('PLAYER_READY', player.video?.currentTime ?? 0);
      // VTurb's documented React integration exposes the SmartPlayer timeupdate
      // callback. Use it for progress and infer no unsupported player events.
      player.on('timeupdate', () => { const second = Math.floor(player.video?.currentTime ?? 0); if (second === lastSecond.current) return; const previous = lastSecond.current; lastSecond.current = second; const range = second > previous && second - previous <= 10 ? [{ rangeKey: `r-${previous}-${second}-${Date.now()}`, startMs: previous * 1000, endMs: second * 1000, observedStartAt: new Date(Date.now() - 1000).toISOString(), observedEndAt: new Date().toISOString() }] : []; enqueue('PROGRESS', second, range); if (!pitchReached.current && second >= PITCH) { pitchReached.current = true; setPitch(true); enqueue('PITCH_REACHED', second); } });
    };
    document.addEventListener('player:ready', onReady); const timer = window.setInterval(onReady, 1000);
    return () => { document.removeEventListener('player:ready', onReady); window.clearInterval(timer); };
  }, [session, pitch]);

  function openCheckout() { setCheckoutOpen(true); enqueue('CHECKOUT_OPEN', lastSecond.current); }
  async function submit(e: FormEvent) { e.preventDefault(); if (!session) return; const response = await fetch('/api/academy/precheckout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.collectorToken}` }, body: JSON.stringify(lead) }); if (!response.ok) { setMessage('Confira seus dados e tente novamente.'); return; } enqueue('CHECKOUT_CLICK', lastSecond.current); await flush(); window.location.assign(CHECKOUT); }

  return <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'Arial, sans-serif' }}><h1>Corretor Academy</h1><p>Assista à apresentação completa e descubra como iniciar sua carreira como corretor de imóveis.</p>{createElement('vturb-smartplayer', { id: `vid-${VIDEO}`, style: { display: 'block', margin: '0 auto', width: '100%', maxWidth: 400 } }, <div className="vturb-player-placeholder" style={{ position: 'relative', width: '100%', padding: '177.7778% 0 0', backgroundColor: 'black' }} />)}{pitch && <section style={{ marginTop: 24, padding: 20, border: '1px solid #ddd', borderRadius: 12 }}><h2>Pronto para dar o próximo passo?</h2><button onClick={openCheckout}>Quero conhecer o Corretor Academy</button></section>}{checkoutOpen && <form onSubmit={submit} style={{ marginTop: 20, display: 'grid', gap: 12 }}><h2>Receba acesso ao checkout</h2><input required placeholder="Nome" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} /><input required type="email" placeholder="E-mail" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} /><input required placeholder="WhatsApp/telefone" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} /><button type="submit">Continuar para pagamento</button>{message && <p>{message}</p>}</form>}</main>;
}
