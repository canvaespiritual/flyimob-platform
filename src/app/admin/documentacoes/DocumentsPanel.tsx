"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_DOCUMENT_BYTES, DOCUMENT_FILE_ACCEPT, DOCUMENT_FORMAT_ERROR, documentationMimeType, supportsDocumentationPreview } from "@/lib/documentacoes/file-formats";

const inputClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";
type Person = { id: string; name: string; relationship: string };
type Type = { id: string; name: string };
type Doc = { id: string; personId: string | null; documentTypeId: string | null; documentType: { name: string } | null; originalFileName: string; mimeType: string; fileSize: number; status: string; createdAt: string; uploadOrigin: string; uploadedByRole: string; uploadedBy: { name: string }; canCorrect: boolean; canFinalize: boolean; replacementReason?: string | null; replacedDocumentId: string | null };
type Data = { items: Doc[]; total: number; page: number; pageSize: number; version: number; people: Person[]; types: Type[]; canUpload: boolean; storageConfigured: boolean };
type QueueItem = { key: string; file: File; personId: string; documentTypeId: string; state: "aguardando" | "enviando" | "validando" | "concluído" | "erro"; progress: number; error?: string; authorizationId?: string; uploaded?: boolean; replacedDocumentId?: string; replacementReason?: string };
class UploadError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new UploadError(result.error ?? "Não foi possível concluir a operação.", response.status); return result;
}
function sendFile(url: string, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("PUT", url); xhr.timeout = 60000; xhr.setRequestHeader("Content-Type", documentationMimeType(file.name, file.type)!);
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 409) resolve(); else { let message = "Não foi possível enviar o arquivo. Tente novamente."; try { message = JSON.parse(xhr.responseText).error ?? message; } catch {} reject(new UploadError(message, xhr.status)); } };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Conexão interrompida. Você pode tentar novamente sem perder a classificação.")); xhr.send(file);
  });
}
export default function DocumentsPanel({ folderId, admin = false, onChange }: { folderId: string; admin?: boolean; onChange?: () => void }) {
  const [data, setData] = useState<Data>(); const [message, setMessage] = useState(""); const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false); const [audit, setAudit] = useState(false); const [page, setPage] = useState(1);
  const [allPerson, setAllPerson] = useState(""); const [selectedPerson, setSelectedPerson] = useState(""); const [selectedType, setSelectedType] = useState("");
  const [replacement, setReplacement] = useState<Doc>(); const picker = useRef<HTMLInputElement>(null); const lock = useRef(false);
  const base = `/api/documentacoes/pastas/${folderId}/documentos`;
  const load = useCallback(async () => { const result = await request<Data>(`${base}?page=${page}&audit=${audit}`); setData(result); return result; }, [base, page, audit]);
  useEffect(() => { let live = true; request<Data>(`${base}?page=${page}&audit=${audit}`).then(result => { if (live) { setData(result); setMessage(""); } }).catch(error => { if (live) { setData(undefined); setMessage(error.message); } }); return () => { live = false; }; }, [base, page, audit]);
  function patch(key: string, values: Partial<QueueItem>) { setQueue(rows => rows.map(row => row.key === key ? { ...row, ...values } : row)); }
  function choose(personId = "", documentTypeId = "", document?: Doc) { setSelectedPerson(personId); setSelectedType(documentTypeId); setReplacement(document); picker.current?.click(); }
  function add(files: FileList | File[]) {
    const rows: QueueItem[] = []; let error = "";
    if (queue.filter(row => row.state !== "concluído").length + files.length > 20) { setMessage("Selecione até 20 arquivos por fila."); return; }
    const reason = replacement ? window.prompt("Motivo da substituição:")?.trim() : undefined;
    if (replacement && !reason) { setMessage("Informe o motivo para substituir o documento."); return; }
    for (const file of Array.from(files)) {
      if (!file.size || file.size > MAX_DOCUMENT_BYTES) { error = `${file.name}: arquivo vazio ou acima de 15 MB.`; continue; }
      if (!documentationMimeType(file.name, file.type)) { error = `${file.name}: ${DOCUMENT_FORMAT_ERROR}`; continue; }
      if (replacement && rows.length) { error = "Escolha somente um arquivo para cada substituição."; break; }
      rows.push({ key: crypto.randomUUID(), file, personId: selectedPerson, documentTypeId: selectedType, state: "aguardando", progress: 0,
        ...(replacement ? { replacedDocumentId: replacement.id, replacementReason: reason } : {}) });
    }
    setQueue(before => [...before, ...rows]); setMessage(error); setReplacement(undefined);
  }
  async function upload() {
    if (!data || lock.current) return; lock.current = true; setBusy(true); setMessage(""); let version = data.version;
    try {
      for (const row of queue.filter(item => item.state !== "concluído")) {
        patch(row.key, { state: "enviando", error: undefined });
        try {
          let id = row.authorizationId;
          if (!id) {
            const authorization = await request<{ id: string; version: number }>(base, "POST", { version, originalFileName: row.file.name, mimeType: documentationMimeType(row.file.name, row.file.type), fileSize: row.file.size, personId: row.personId || null, documentTypeId: row.documentTypeId || null, replacedDocumentId: row.replacedDocumentId, replacementReason: row.replacementReason });
            id = authorization.id; version = authorization.version; patch(row.key, { authorizationId: id });
          }
          if (!row.uploaded) { await sendFile(`${base}/${id}/upload`, row.file, percent => patch(row.key, { progress: percent })); patch(row.key, { uploaded: true }); }
          patch(row.key, { state: "validando", progress: 100 });
          const finalized = await request<{ version: number }>(`${base}/${id}/finalizar`, "POST", { version }); version = finalized.version; patch(row.key, { state: "concluído" });
        } catch (error) {
          patch(row.key, { state: "erro", error: (error as Error).message });
          if (error instanceof UploadError && error.status === 410) patch(row.key, { authorizationId: undefined, uploaded: false, progress: 0 });
          try { version = (await load()).version; } catch {}
        }
      }
      await load(); onChange?.();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); lock.current = false; }
  }
  async function invalidate(document: Doc) {
    const reason = window.prompt("Motivo da invalidação:")?.trim(); if (!reason || !data || lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try { await request(`${base}/${document.id}/invalidar`, "POST", { version: data.version, reason }); await load(); onChange?.(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); lock.current = false; }
  }
  async function resume(document: Doc) {
    if (!data || lock.current) return; lock.current = true; setBusy(true);
    try { await request(`${base}/${document.id}/finalizar`, "POST", { version: data.version }); await load(); onChange?.(); setMessage("Upload finalizado."); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); lock.current = false; }
  }
  function personSelect(value: string, change: (value: string) => void, disabled = false) { return <select className={inputClass} aria-label="Pessoa do documento" disabled={disabled} value={value} onChange={event => change(event.target.value)}><option value="">Documentos gerais / sem pessoa</option>{data?.people.map(person => <option key={person.id} value={person.id}>{person.name} — {person.relationship.toLowerCase().replaceAll("_", " ")}</option>)}</select>; }
  function typeSelect(value: string, change: (value: string) => void, disabled = false) { return <select className={inputClass} aria-label="Tipo de documento" disabled={disabled} value={value} onChange={event => change(event.target.value)}><option value="">Sem classificação</option>{data?.types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select>; }
  return <section className="space-y-4" aria-label="Documentos da pasta">
    {message && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{message}</p>}
    {!data ? !message && <p>Carregando documentos…</p> : <>
      {!data.storageConfigured && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">O storage privado ainda precisa ser configurado pelo administrador. Upload, preview e download dependem dessa configuração.</p>}
      <div className="flex flex-wrap items-center gap-3"><button className={buttonClass} disabled={busy || !data.canUpload || !data.storageConfigured} onClick={() => choose()}>Adicionar documentos</button><button className={buttonClass} disabled={busy} onClick={() => void load().catch(error => setMessage(error.message))}>Atualizar documentos</button>{admin && <label className="text-sm"><input type="checkbox" checked={audit} disabled={busy} onChange={event => { setAudit(event.target.checked); setPage(1); }} /> Mostrar histórico e uploads pendentes</label>}</div>
      <input ref={picker} type="file" className="hidden" aria-label="Selecionar documentos" accept={DOCUMENT_FILE_ACCEPT} multiple={!replacement} onChange={event => { if (event.target.files) add(event.target.files); event.target.value = ""; }} />
      {queue.length > 0 && <div className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">Fila de documentos</h3><div className="flex flex-wrap gap-2"><div className="min-w-0 flex-1">{personSelect(allPerson, setAllPerson, busy)}</div><button className={buttonClass} disabled={busy} onClick={() => setQueue(rows => rows.map(row => row.state === "concluído" || row.authorizationId ? row : { ...row, personId: allPerson }))}>Aplicar pessoa a todos</button><button className={buttonClass} disabled={busy} onClick={() => setQueue(rows => rows.filter(row => row.state !== "concluído"))}>Limpar concluídos</button></div>
        {queue.map(row => <div key={row.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{row.file.name}</p><p className="text-xs">{(row.file.size / 1024 / 1024).toFixed(2)} MB{row.replacedDocumentId ? " · substituição" : ""}</p></div>{personSelect(row.personId, value => patch(row.key, { personId: value }), busy || !!row.authorizationId)}{typeSelect(row.documentTypeId, value => patch(row.key, { documentTypeId: value }), busy || !!row.authorizationId)}<div className="space-y-1 text-sm"><p>{row.state}{["enviando", "validando"].includes(row.state) ? ` · ${row.progress}%` : ""}</p>{row.state === "enviando" && <progress className="w-full" max={100} value={row.progress} aria-label={`Progresso de ${row.file.name}`} />}{row.error && <p role="status" className="text-red-700">{row.error}</p>}{!busy && row.state !== "concluído" && <button className={buttonClass} onClick={() => setQueue(rows => rows.filter(item => item.key !== row.key))}>Retirar da fila</button>}</div></div>)}
        <button className={buttonClass} disabled={busy || !queue.some(row => row.state !== "concluído")} onClick={() => void upload()}>{busy ? "Enviando…" : "Enviar / tentar novamente"}</button>
      </div>}
      {[...data.people.map(person => ({ id: person.id, name: person.name, relationship: person.relationship })), { id: "", name: "Documentos gerais / sem pessoa", relationship: "" }].map(person => <div key={person.id} className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">{person.name}</h3>{person.relationship && <p className="text-sm capitalize">{person.relationship.toLowerCase().replaceAll("_", " ")}</p>}
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">{typeSelect(selectedType, setSelectedType, busy)}<button className={buttonClass} disabled={busy || !data.canUpload || !data.storageConfigured} onClick={() => choose(person.id, selectedType)}>Adicionar arquivo nesta categoria</button></div>
        {data.items.filter(document => (document.personId ?? "") === person.id).map(document => <article key={document.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="font-medium">{document.documentType?.name ?? "Sem classificação"}</p><p className="break-all text-sm">{document.originalFileName} · {(document.fileSize / 1024 / 1024).toFixed(2)} MB</p><p className="text-xs text-gray-600">Enviado por {document.uploadedBy.name} · {document.uploadOrigin === "CORRESPONDENT" ? "Correspondente" : "Administração"} ({document.uploadedByRole}) · {new Date(document.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div><span className="self-start rounded-full border px-2 py-1 text-xs">{({ ACTIVE: "Ativo", INVALIDATED: "Invalidado", REPLACED: "Substituído", PROCESSING: "Upload pendente" } as Record<string, string>)[document.status]}</span></div>{document.replacedDocumentId && <p className="text-xs">Versão que substitui um documento anterior.</p>}{document.replacementReason && <p className="break-words text-sm">Motivo: {document.replacementReason}</p>}
          {document.status === "ACTIVE" && <p className="text-xs text-gray-600">{supportsDocumentationPreview(document.mimeType) ? "Documento armazenado. Se a visualização não abrir, baixe e abra em um aplicativo externo. PDFs protegidos podem solicitar senha no visualizador." : "Documento armazenado. Este formato precisa ser baixado e aberto em um aplicativo externo."}</p>}
          <div className="flex flex-wrap gap-2">{document.status === "ACTIVE" && <>{supportsDocumentationPreview(document.mimeType) && <a className={buttonClass} href={`${base}/${document.id}/arquivo`} target="_blank" rel="noopener noreferrer">Visualizar</a>}<a className={buttonClass} href={`${base}/${document.id}/arquivo?download=true`}>Baixar</a>{document.canCorrect && <><button className={buttonClass} disabled={busy || !data.canUpload || !data.storageConfigured} onClick={() => choose(document.personId ?? "", document.documentTypeId ?? "", document)}>Substituir</button><button className={buttonClass} disabled={busy || !data.canUpload} onClick={() => void invalidate(document)}>Invalidar</button></>}</>}{document.canFinalize && <button className={buttonClass} disabled={busy || !data.canUpload || !data.storageConfigured} onClick={() => void resume(document)}>Tentar finalizar upload</button>}</div>
        </article>)}
        {!data.items.some(document => (document.personId ?? "") === person.id) && <p className="text-sm text-gray-500">Nenhum arquivo nesta página.</p>}
      </div>)}
      <div className="flex flex-wrap items-center gap-3 text-sm"><button className={buttonClass} disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {data.page} · {data.total} documentos</span><button className={buttonClass} disabled={busy || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
    </>}
  </section>;
}
