"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lesson, Playback } from "@/lib/training/contract";
import { trainingFetch, resumePosition } from "@/lib/training/client";
import { nextPlaybackContext, PlaybackRuntime } from "@/lib/training/playback-runtime";

export default function Player({ lesson, onCompleted, onRuntime }: { lesson: Lesson; onCompleted: (id: string) => void; onRuntime: (runtime: PlaybackRuntime | null) => void }) {
  const video = useRef<HTMLVideoElement>(null), runtime = useRef<PlaybackRuntime | null>(null);
  const initialResume = useRef<{ position: number; playing: boolean; rate: number } | null>(null);
  const recovering = useRef(false);
  const [playback, setPlayback] = useState<Playback | null>(null), [error, setError] = useState(""), [warning, setWarning] = useState(""), [percent, setPercent] = useState(0), [retry, setRetry] = useState(0);
  const sessionId = playback?.sessionId, revision = playback?.revision, sequence = playback?.sequence;
  const reopen = useCallback(() => {
    if (recovering.current) return;
    recovering.current = true;
    if (video.current) initialResume.current = { position: video.current.currentTime, playing: !video.current.paused, rate: video.current.playbackRate };
    void runtime.current?.finish();
    setPlayback(null); setError(""); setRetry(n => n + 1);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const open = async () => {
      try {
        const context = await nextPlaybackContext();
        if (!active) return;
        const p: Playback = await trainingFetch(`/api/training/lessons/${encodeURIComponent(lesson.id)}/playback`, "POST", context, controller.signal);
        if (!active) return;
        if (!initialResume.current) initialResume.current = { position: p.position ?? 0, playing: false, rate: 1 };
        recovering.current = false; setPercent(p.percent ?? 0); setPlayback(p); setError(""); setWarning("");
      } catch (e) { if (active) { recovering.current = false; setError((e as Error).message); } }
    };
    void open();
    return () => { active = false; controller.abort(); };
  }, [lesson.id, retry]);
  useEffect(() => {
    const element = video.current;
    if (!element || !sessionId) return;
    const base = `/api/training/lessons/${encodeURIComponent(lesson.id)}`;
    const player = new PlaybackRuntime(element, { sessionId, revision, sequence }, (method, body, keepalive) => trainingFetch(`${base}/${method === "PROGRESS" ? "progress" : "playback"}`, method === "PROGRESS" ? "POST" : method, body, undefined, keepalive), {
      progress: p => { setPercent(Number(p.percent ?? 0)); if (p.completed) onCompleted(lesson.id); },
      warning: setWarning, fatal: setError, expired: reopen,
      url: url => { setPlayback(old => old ? { ...old, url } : old); setError(""); },
    });
    runtime.current = player; onRuntime(player);
    return () => { onRuntime(null); runtime.current = null; void player.finish(); };
  }, [sessionId, revision, sequence, lesson.id, onCompleted, onRuntime, reopen]);
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">{lesson.title}</h2>
    {error && <div role="alert" className="rounded border border-orange-300 bg-orange-50 p-3">{error} <button className="underline p-2" onClick={reopen}>Reabrir player</button></div>}
    {warning && !error && <p role="status">{warning}</p>}
    {!playback && !error && <p role="status">Preparando a aula…</p>}
    {playback?.source === "PRIVATE" && <><video ref={video} controls playsInline preload="metadata" src={playback.url} className="w-full rounded bg-black max-h-[65dvh]" onLoadedMetadata={() => {
      const element = video.current, state = initialResume.current;
      if (element && state) { initialResume.current = null; element.currentTime = resumePosition(state.position, element.duration); element.playbackRate = state.rate; if (state.playing) void element.play().catch(() => {}); }
    }} /><p className="text-sm">Progresso da aula: {Math.round(percent)}% · Envio de posição a cada 10 segundos; trechos pulados não contam como assistidos.</p></>}
    {playback?.source === "YOUTUBE" && playback.youtubeId && /^[\w-]{11}$/.test(playback.youtubeId) && <><iframe className="w-full aspect-video rounded" src={`https://www.youtube-nocookie.com/embed/${playback.youtubeId}`} title={lesson.title} allow="fullscreen; picture-in-picture" allowFullScreen /><p>Aula externa: a Horizonte não mede progresso nem retomada deste vídeo.</p></>}
  </section>;
}
