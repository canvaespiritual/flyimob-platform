// Shared wire contract/runtime; mirrored in Horizonte for the native player.
export type Segment = { start: number; end: number; seconds: number; rate: number };
export type PlaybackSession = { sessionId?: string; sequence?: number; revision?: string; url?: string };
type Requester = (method: string, body?: unknown, keepalive?: boolean) => Promise<Record<string, unknown>>;
let contextPromise: Promise<string> | undefined;
let generation = 0;
function storageGet(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }
function storageSet(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch {} }
export function playbackContext(): Promise<string> {
  if (contextPromise) return contextPromise;
  contextPromise = new Promise(resolve => {
    let id = storageGet('playback-context') || crypto.randomUUID();
    const nonce = crypto.randomUUID();
    let channel: BroadcastChannel;
    try { channel = new BroadcastChannel('playback-context-ownership'); }
    catch { storageSet('playback-context', id); resolve(id); return; }
    // sessionStorage can be copied by opening/duplicating a tab. The incumbent
    // keeps its context; the new document selects its own before any API call.
    let owned = false;
    channel.onmessage = event => {
      const message = event.data;
      if (message?.id !== id || message.nonce === nonce) return;
      if (message.type === 'claim' && owned) channel.postMessage({ type: 'owned', id, nonce });
      if (message.type === 'claim' && !owned && message.nonce < nonce) id = crypto.randomUUID();
      if (message.type === 'owned' && !owned) id = crypto.randomUUID();
    };
    channel.postMessage({ type: 'claim', id, nonce });
    setTimeout(() => { owned = true; storageSet('playback-context', id); resolve(id); }, 150);
  });
  return contextPromise;
}
export async function nextPlaybackContext() {
  const contextId = await playbackContext();
  generation = Math.max(Date.now(), generation + 1, Number(storageGet('playback-generation') || 0) + 1);
  storageSet('playback-generation', String(generation));
  return { contextId, generation };
}
export class WatchTracker {
  private anchor: { position: number; time: number; rate: number } | null = null;
  private segments: Segment[] = [];
  constructor(private video: HTMLVideoElement, private now = () => performance.now()) {}
  sample() {
    const v = this.video, time = this.now(), position = v.currentTime;
    if (v.seeking || !Number.isFinite(position) || document.visibilityState === 'hidden' || v.readyState < 3) { this.anchor = null; return; }
    if (this.anchor) {
      const seconds = (time - this.anchor.time) / 1000, delta = position - this.anchor.position;
      if (seconds > 0 && seconds <= 2 && delta > 0 && delta <= seconds * this.anchor.rate + 0.25) {
        const last = this.segments.at(-1);
        if (last && last.rate === this.anchor.rate && Math.abs(last.end - this.anchor.position) < 0.001 && last.seconds + seconds <= 30) { last.end = position; last.seconds += seconds; }
        else this.segments.push({ start: this.anchor.position, end: position, seconds, rate: this.anchor.rate });
      }
    }
    this.anchor = !v.paused && [1, 1.25, 1.5, 2].includes(v.playbackRate) ? { position, time, rate: v.playbackRate } : null;
  }
  boundary() { this.anchor = null; }
  take() { this.sample(); const segments = this.segments.splice(0, 128); const rate = [1, 1.25, 1.5, 2].includes(this.video.playbackRate) ? this.video.playbackRate : 1; return { position: this.video.currentTime, playing: !this.video.paused && !this.video.seeking, rate, segments }; }
}
export class PlaybackRuntime {
  private tracker: WatchTracker;
  private active = true;
  private busy = false;
  private renewing = false;
  private sequence: number;
  private lastAttempt = performance.now();
  private pending: Record<string, unknown> | null = null;
  private deferred: ReturnType<typeof setTimeout> | undefined;
  private timers: ReturnType<typeof setInterval>[] = [];
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private restore: { position: number; playing: boolean; rate: number } | null = null;
  private renewAttempts = 0;
  private finishing: Promise<void> | undefined;
  constructor(private video: HTMLVideoElement, private playback: PlaybackSession, private request: Requester, private callbacks: {
    progress: (data: Record<string, unknown>) => void; warning: (message: string) => void;
    fatal: (message: string) => void; expired: () => void; url: (url: string) => void;
  }) {
    this.sequence = playback.sequence ?? 0;
    this.tracker = new WatchTracker(video);
    const listen = (target: EventTarget, name: string, handler: () => void) => { target.addEventListener(name, handler); this.listeners.push([target, name, handler]); };
    listen(video, 'timeupdate', () => this.tracker.sample());
    listen(video, 'play', () => { this.tracker.boundary(); this.tracker.sample(); });
    listen(video, 'seeking', () => this.tracker.boundary());
    listen(video, 'seeked', () => { this.tracker.boundary(); this.tracker.sample(); void this.report(); });
    listen(video, 'ratechange', () => { this.tracker.boundary(); this.tracker.sample(); void this.report(); });
    listen(video, 'pause', () => { this.tracker.sample(); void this.report(); });
    listen(video, 'ended', () => { this.tracker.sample(); void this.report(); });
    listen(video, 'error', () => { void this.renew(); });
    listen(video, 'loadedmetadata', () => {
      if (!this.restore) return;
      const state = this.restore; this.restore = null;
      video.currentTime = Math.min(Math.max(0, state.position), video.duration);
      video.playbackRate = state.rate;
      if (state.playing) void video.play().catch(() => {});
    });
    listen(document, 'visibilitychange', () => {
      this.tracker.boundary();
      if (document.visibilityState === 'visible') { this.tracker.sample(); void this.renew(); }
      void this.report();
    });
    listen(window, 'pagehide', () => { void this.finish(); });
    this.timers.push(setInterval(() => this.tracker.sample(), 250), setInterval(() => { void this.report(); }, 10000), setInterval(() => { void this.renew(); }, 240000));
  }
  private denied(e: unknown) { const error = e as { status?: number; code?: string }; return [401, 403, 404].includes(error.status ?? 0) || error.code === 'upstream_authorization'; }
  async report(keepalive = false) {
    if (!this.active || this.busy || !this.playback.sessionId) return;
    const wait = 3200 - (performance.now() - this.lastAttempt);
    if (wait > 0) { if (!this.deferred) this.deferred = setTimeout(() => { this.deferred = undefined; void this.report(keepalive); }, wait); return; }
    this.busy = true;
    if (!this.pending) this.pending = { sessionId: this.playback.sessionId, sequence: ++this.sequence, ...this.tracker.take() };
    try {
      const data = await this.request('PROGRESS', this.pending, keepalive);
      this.pending = null;
      if (this.active) { this.callbacks.progress(data); this.callbacks.warning(''); }
    } catch (e) {
      if (!this.active) return;
      const error = e as { code?: string; message?: string };
      if (this.denied(e)) { this.video.pause(); this.callbacks.fatal(error.message || 'Acesso à aula indisponível.'); }
      else if (error.code === 'session_expired') { this.pending = null; this.callbacks.expired(); }
      else {
        if (['invalid_progress', 'progress_rejected'].includes(error.code ?? '')) { this.pending = null; this.tracker.boundary(); }
        this.callbacks.warning(error.message || 'O progresso ainda não foi confirmado. A reprodução pode continuar.');
      }
    } finally { this.lastAttempt = performance.now(); this.busy = false; }
  }
  async renew() {
    if (!this.active || this.renewing) return;
    this.renewing = true;
    try {
      if (++this.renewAttempts > 3) throw new Error('Não foi possível renovar a mídia. Reabra o player para tentar novamente.');
      const data = await this.request('PATCH');
      if (!this.active) return;
      if (data.revision !== this.playback.revision) { this.video.pause(); this.callbacks.fatal('Esta aula foi atualizada. Reabra o player para assistir à nova versão.'); return; }
      if (typeof data.url !== 'string') throw new Error('Resposta de mídia inválida.');
      this.restore = { position: this.video.currentTime, playing: !this.video.paused, rate: this.video.playbackRate };
      this.tracker.boundary(); this.renewAttempts = 0;
      this.callbacks.url(data.url);
    } catch (e) { if (this.active) { if (this.denied(e)) this.video.pause(); this.callbacks.fatal((e as Error).message); } }
    finally { this.renewing = false; }
  }
  finish() { return this.finishing ??= this.finalize(); }
  private async finalize() {
    if (!this.active) return;
    // Snapshot before detaching; close is independent from progress validation.
    const final = { sessionId: this.playback.sessionId, sequence: ++this.sequence, ...this.tracker.take() };
    this.active = false;
    this.video.pause();
    if (this.deferred) clearTimeout(this.deferred);
    this.timers.forEach(clearInterval);
    for (const [target, name, handler] of this.listeners) target.removeEventListener(name, handler);
    if (!this.playback.sessionId) return;
    // Preserve FIFO even when navigation occurs while a report is in flight.
    while (this.busy) await new Promise(resolve => setTimeout(resolve, 25));
    try {
      const wait = 3200 - (performance.now() - this.lastAttempt);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (this.pending) { await this.request('PROGRESS', this.pending, true); this.pending = null; await new Promise(resolve => setTimeout(resolve, 3200)); }
      await this.request('PROGRESS', final, true);
    } catch { /* lease expiry also recovers abrupt exits and rejected final progress */ }
    finally { await this.request('DELETE', { sessionId: this.playback.sessionId }, true).catch(() => {}); }
  }
}
