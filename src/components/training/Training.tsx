"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Course, Lesson, Playback } from "@/lib/training/contract";

export async function trainingFetch(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!r.ok) {
    if (r.status === 401) throw new Error("Sua sessão expirou. Entre novamente na Flyimob.");
    if ([403, 404].includes(r.status)) throw new Error("Acesso revogado ou aula indisponível. Consulte seu administrador.");
    throw new Error("Não foi possível conectar aos treinamentos. Verifique sua conexão e tente novamente.");
  }
  return r.json();
}
function Player({ lesson, onCompleted }: { lesson: Lesson; onCompleted: (id: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), sequence = useRef(0), busy = useRef(false);
  const [playback, setPlayback] = useState<Playback | null>(null), [error, setError] = useState(""), [percent, setPercent] = useState(0), [retry, setRetry] = useState(0);
  const resume = useRef(0), shouldPlay = useRef(false);
  useEffect(() => {
    let active = true;
    trainingFetch(`/api/training/lessons/${encodeURIComponent(lesson.id)}/playback`, "POST").then(p => {
      if (!active) return; resume.current = p.position ?? 0; sequence.current = 0; setPercent(p.percent ?? 0); setPlayback(p); setError("");
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [lesson.id, retry]);
  useEffect(() => {
    if (!playback?.sessionId) return;
    let active = true;
    let lastReport = Date.now(), deferred: ReturnType<typeof setTimeout> | undefined;
    const report = async () => {
      const v = video.current;
      if (!v || busy.current || !active) return;
      const wait = 3200 - (Date.now() - lastReport);
      if (wait > 0) {
        if (!deferred) deferred = setTimeout(() => { deferred = undefined; void report(); }, wait);
        return;
      }
      busy.current = true;
      try {
        const p = await trainingFetch(`/api/training/lessons/${encodeURIComponent(lesson.id)}/progress`, "POST", { sessionId: playback.sessionId, sequence: ++sequence.current, position: v.currentTime, playing: !v.paused && !v.seeking && v.readyState >= 3, rate: v.playbackRate });
        if (active) { setError(""); setPercent(p.percent ?? 0); if (p.completed) onCompleted(lesson.id); }
      } catch (e) { if (active) { setError((e as Error).message); video.current?.pause(); } }
      finally { lastReport = Date.now(); busy.current = false; }
    };
    const onPause = () => { void report(); };
    const onHidden = () => { if (document.visibilityState === "hidden") void report(); };
    const element = video.current;
    element?.addEventListener("pause", onPause);
    element?.addEventListener("ended", onPause);
    element?.addEventListener("seeked", onPause);
    document.addEventListener("visibilitychange", onHidden);
    const heartbeat = window.setInterval(report, 10000);
    const refresh = window.setInterval(async () => {
      try {
        const p = await trainingFetch(`/api/training/lessons/${encodeURIComponent(lesson.id)}/playback`, "PATCH");
        if (!active) return;
        if (p.revision !== playback.revision) { video.current?.pause(); setError("Esta aula foi atualizada. Reabra o player para assistir à nova versão."); return; }
        resume.current = video.current?.currentTime ?? 0; shouldPlay.current = !!video.current && !video.current.paused;
        setPlayback(old => old ? { ...old, url: p.url } : old);
      } catch (e) { if (active) { video.current?.pause(); setError((e as Error).message); } }
    }, 240000);
    return () => { active = false; clearInterval(heartbeat); clearInterval(refresh); if (deferred) clearTimeout(deferred); element?.removeEventListener("pause", onPause); element?.removeEventListener("ended", onPause); element?.removeEventListener("seeked", onPause); document.removeEventListener("visibilitychange", onHidden); };
  }, [playback?.sessionId, playback?.revision, lesson.id, onCompleted]);
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">{lesson.title}</h2>
    {error && <div role="alert" className="rounded border border-orange-300 bg-orange-50 p-3">{error} <button className="underline p-2" onClick={() => { setPlayback(null); setRetry(n => n + 1); }}>Reabrir player</button></div>}
    {!playback && !error && <p role="status">Preparando a aula…</p>}
    {playback?.source === "PRIVATE" && <><video ref={video} controls playsInline preload="metadata" src={playback.url} className="w-full rounded bg-black max-h-[65dvh]" onLoadedMetadata={() => { if (video.current) { video.current.currentTime = resume.current; if (shouldPlay.current) void video.current.play().catch(() => {}); } }} /><p className="text-sm">Progresso da aula: {Math.round(percent)}% · Posição salva a cada 10 segundos.</p></>}
    {playback?.source === "YOUTUBE" && playback.youtubeId && /^[\w-]{11}$/.test(playback.youtubeId) && <><iframe className="w-full aspect-video rounded" src={`https://www.youtube-nocookie.com/embed/${playback.youtubeId}`} title={lesson.title} allow="fullscreen; picture-in-picture" allowFullScreen /><p>Aula externa: a Horizonte não mede progresso nem retomada deste vídeo.</p></>}
  </section>;
}
export default function Training() {
  const [courses, setCourses] = useState<Course[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [selected, setSelected] = useState<string | null>(null), [lesson, setLesson] = useState<Lesson | null>(null), [lastLesson, setLastLesson] = useState<string | null>(null);
  const load = () => { setLoading(true); setError(""); trainingFetch("/api/training/courses").then(d => { setCourses(d.data); setLastLesson(d.lastLessonId); }).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { let active = true; trainingFetch("/api/training/courses").then(d => { if (active) { setCourses(d.data); setLastLesson(d.lastLessonId); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const course = courses.find(c => c.id === selected), lessons = course?.modules.flatMap(m => m.lessons) ?? [], index = lessons.findIndex(l => l.id === lesson?.id);
  const completed = useCallback((id: string) => setCourses(old => old.map(c => ({ ...c, modules: c.modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === id ? { ...l, progress: [{ completedAt: new Date().toISOString() }] } : l) })) }))), []);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Treinamentos</h1><p>Seus cursos, aulas e progresso na Flyimob.</p>
    {loading && <p role="status">Buscando cursos…</p>}{error && <div role="alert">{error} <button onClick={load} className="underline p-3">Tentar novamente</button></div>}
    {!loading && !error && !courses.length && <p>Nenhum curso liberado. Consulte seu administrador.</p>}
    {!course ? <div className="grid gap-4 md:grid-cols-2">{courses.map(c => { const all = c.modules.flatMap(m => m.lessons), done = all.filter(l => l.progress.some(p => p.completedAt)).length; return <button key={c.id} onClick={() => { setSelected(c.id); setLesson(null); }} className="text-left border rounded-xl p-5"><strong>{c.title}</strong><p>{c.description}</p><p>{done}/{all.length} aulas concluídas</p><progress className="w-full" max={all.length || 1} value={done} /></button>; })}</div> : <><button className="underline p-2" onClick={() => { setSelected(null); setLesson(null); }}>Voltar aos cursos</button><h2 className="text-xl font-semibold">{course.title}</h2><p>{course.description}</p><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><nav aria-label="Aulas" className="border rounded p-3 space-y-3">{course.modules.map(m => <div key={m.id}><h3 className="font-semibold">{m.title}</h3>{m.lessons.map(l => <button key={l.id} aria-current={lesson?.id === l.id ? "true" : undefined} className={`block w-full text-left rounded p-3 ${lesson?.id === l.id ? "bg-orange-100" : "hover:bg-gray-50"}`} onClick={() => setLesson(l)}>{l.progress.some(p => p.completedAt) ? "✓ " : ""}{l.title}</button>)}</div>)}</nav><div className="min-w-0">{lesson ? <Player key={lesson.id} lesson={lesson} onCompleted={completed} /> : <button className="border rounded p-4" onClick={() => setLesson(lessons.find(l => l.id === lastLesson) ?? lessons.find(l => !l.progress.some(p => p.completedAt)) ?? lessons[0] ?? null)}>Continuar curso</button>}{lesson && <nav className="flex justify-between gap-3 mt-4"><button disabled={index <= 0} className="border rounded p-3 disabled:opacity-40" onClick={() => setLesson(lessons[index - 1])}>Anterior</button><button disabled={index >= lessons.length - 1} className="border rounded p-3 disabled:opacity-40" onClick={() => setLesson(lessons[index + 1])}>Próxima</button></nav>}</div></div></>}
  </div>;
}
