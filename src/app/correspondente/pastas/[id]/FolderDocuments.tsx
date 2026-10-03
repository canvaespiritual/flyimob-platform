"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import DocumentsPanel from "@/app/admin/documentacoes/DocumentsPanel";
import WorkflowPanel from "@/app/admin/documentacoes/WorkflowPanel";
type Folder = { id: string; status: string; broker: { name: string }; people: { id: string; name: string; relationship: string }[] };
export default function FolderDocuments({ id }: { id: string }) {
  const [folder, setFolder] = useState<Folder>(); const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/documentacoes/correspondente/pastas/${id}`, { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível abrir a pasta."); if (live) setFolder(data.folder); }).catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [id, revision]);
  return <main className="min-h-screen bg-gray-50 p-4 sm:p-6"><div className="mx-auto max-w-6xl space-y-4"><Link className="text-sm underline" href="/correspondente">Voltar às minhas pastas</Link>{error && <p role="status" className="rounded-lg border bg-amber-50 p-3 text-sm">{error}</p>}{folder ? <><div className="rounded-xl border bg-white p-4"><h1 className="text-xl font-semibold">{folder.people.find(person => person.relationship === "TITULAR")?.name ?? "Pasta documental"}</h1><p className="mt-2 text-sm">Corretor: {folder.broker.name}</p><p className="text-sm capitalize">{folder.status.toLowerCase().replaceAll("_", " ")}</p></div><WorkflowPanel folderId={id} onChange={() => setRevision(value => value + 1)} /><DocumentsPanel key={revision} folderId={id} /></> : !error && <p role="status">Carregando pasta…</p>}</div></main>;
}
