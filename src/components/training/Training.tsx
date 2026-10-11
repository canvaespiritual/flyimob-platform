"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Course, Lesson } from "@/lib/training/contract";
import { trainingFetch } from "@/lib/training/client";
import type { PlaybackRuntime } from "@/lib/training/playback-runtime";
import Player from "./Player";
export { trainingFetch } from "@/lib/training/client";
export default function Training() {
  const currentRuntime = useRef<PlaybackRuntime | null>(null), navigation = useRef(0);
  const onRuntime = useCallback((player: PlaybackRuntime | null) => { currentRuntime.current = player; }, []);

  const [courses, setCourses] = useState<Course[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [selected, setSelected] = useState<string | null>(null), [lesson, setLesson] = useState<Lesson | null>(null), [lastLesson, setLastLesson] = useState<string | null>(null);
  const navigate = async (next: Lesson | null) => { if (next?.id === lesson?.id) return; const attempt = ++navigation.current; await currentRuntime.current?.finish(); if (attempt === navigation.current) setLesson(next); };
  const load = () => { setLoading(true); setError(""); trainingFetch("/api/training/courses").then(d => { setCourses(d.data); setLastLesson(d.lastLessonId); }).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { let active = true; trainingFetch("/api/training/courses").then(d => { if (active) { setCourses(d.data); setLastLesson(d.lastLessonId); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const course = courses.find(c => c.id === selected), lessons = course?.modules.flatMap(m => m.lessons) ?? [], index = lessons.findIndex(l => l.id === lesson?.id);
  const completed = useCallback((id: string) => setCourses(old => old.map(c => ({ ...c, modules: c.modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === id ? { ...l, progress: [{ completedAt: new Date().toISOString() }] } : l) })) }))), []);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Treinamentos</h1><p>Seus cursos, aulas e progresso na Flyimob.</p>
    {loading && <p role="status">Buscando cursos…</p>}{error && <div role="alert">{error} <button onClick={load} className="underline p-3">Tentar novamente</button></div>}
    {!loading && !error && !courses.length && <p>Nenhum curso liberado. Consulte seu administrador.</p>}
    {!course ? <div className="grid gap-4 md:grid-cols-2">{courses.map(c => { const all = c.modules.flatMap(m => m.lessons), done = all.filter(l => l.progress.some(p => p.completedAt)).length; return <button key={c.id} onClick={() => { setSelected(c.id); setLesson(null); }} className="text-left border rounded-xl p-5"><strong>{c.title}</strong><p>{c.description}</p><p>{done}/{all.length} aulas concluídas</p><progress className="w-full" max={all.length || 1} value={done} /></button>; })}</div> : <><button className="underline p-2" onClick={() => { setSelected(null); setLesson(null); }}>Voltar aos cursos</button><h2 className="text-xl font-semibold">{course.title}</h2><p>{course.description}</p><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><nav aria-label="Aulas" className="border rounded p-3 space-y-3">{course.modules.map(m => <div key={m.id}><h3 className="font-semibold">{m.title}</h3>{m.lessons.map(l => <button key={l.id} aria-current={lesson?.id === l.id ? "true" : undefined} className={`block w-full text-left rounded p-3 ${lesson?.id === l.id ? "bg-orange-100" : "hover:bg-gray-50"}`} onClick={() => { void navigate(l); }}>{l.progress.some(p => p.completedAt) ? "✓ " : ""}{l.title}</button>)}</div>)}</nav><div className="min-w-0">{lesson ? <Player key={lesson.id} lesson={lesson} onCompleted={completed} onRuntime={onRuntime} /> : <button className="border rounded p-4" onClick={() => setLesson(lessons.find(l => l.id === lastLesson) ?? lessons.find(l => !l.progress.some(p => p.completedAt)) ?? lessons[0] ?? null)}>Continuar curso</button>}{lesson && <nav className="flex justify-between gap-3 mt-4"><button disabled={index <= 0} className="border rounded p-3 disabled:opacity-40" onClick={() => { void navigate(lessons[index - 1]); }}>Anterior</button><button disabled={index >= lessons.length - 1} className="border rounded p-3 disabled:opacity-40" onClick={() => { void navigate(lessons[index + 1]); }}>Próxima</button></nav>}</div></div></>}
  </div>;
}
