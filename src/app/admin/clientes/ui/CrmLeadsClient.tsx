"use client";

import { useEffect, useMemo, useState } from "react";

type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  rendaBruta: number | null;
  entrada: number | null;
  fgts: number | null;
  dataNascimento: string | null;
  origem: string | null;
  interesse: string | null;
  status: string;
  contextoGeral: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
  calorVenda: string | null;
};

const PAGE_SIZE = 15;

function isOverdue(nextFollowUpAt: string | null) {
  if (!nextFollowUpAt) return false;
  return new Date(nextFollowUpAt).getTime() < Date.now();
}

function statusColor(status: string) {
  if (status === "VENDIDO") return "border-green-300 bg-green-50";
  if (status === "APROVADO") return "border-blue-300 bg-blue-50";
  if (status === "STANDBY") return "border-gray-300 bg-gray-50";
  if (status === "EXCLUIDO") return "border-zinc-200 bg-zinc-50 opacity-70";
  return "border-gray-200 bg-white";
}

function fmtMoney(v: number | null) {
  if (v === null || v === undefined) return "";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return String(v);
  }
}

function normalizePhoneToWhatsApp(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
}

async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  if (!isJson) {
    const text = await res.text();
    throw new Error(
      `API não retornou JSON (status ${res.status}). Trecho: ${text.slice(0, 120)}...`
    );
  }
  return res.json();
}

const STATUS_LABELS: Record<string, string> = {
  CONTATO_INICIAL: "Contato inicial",
  STANDBY: "Standby",
  APROVADO: "Aprovado",
  VENDIDO: "Vendido",
  EXCLUIDO: "Excluído",
};

const ORIGENS = ["CAMPANHA_TRAFEGO", "INDICACAO", "LISTA", "ACAO_EXTERNA"] as const;

function fmtFollowup(v: string) {
  const d = new Date(v);
  try {
    return d.toLocaleString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

export default function CrmLeadsClient() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [minRenda, setMinRenda] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [tab, setTab] = useState<"ATIVOS" | "EXCLUIDOS">("ATIVOS");

  // paginação
  const [page, setPage] = useState(1);

  // modal (criar/editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [fNome, setFNome] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fRenda, setFRenda] = useState("");
  const [fEntrada, setFEntrada] = useState("");
  const [fFgts, setFFgts] = useState("");
  const [fNascimento, setFNascimento] = useState("");
  const [fOrigem, setFOrigem] = useState<string>("");
  const [fInteresse, setFInteresse] = useState("");
  const [fStatus, setFStatus] = useState("CONTATO_INICIAL");
  const [fContexto, setFContexto] = useState("");
  // AGORA: datetime-local => "YYYY-MM-DDTHH:mm"
  const [fFollowUp, setFFollowUp] = useState("");
  const [fCalorVenda, setFCalorVenda] = useState("");

  function resetForm() {
    setFNome("");
    setFTelefone("");
    setFEmail("");
    setFRenda("");
    setFEntrada("");
    setFFgts("");
    setFNascimento("");
    setFOrigem("");
    setFInteresse("");
    setFStatus("CONTATO_INICIAL");
    setFContexto("");
    setFFollowUp("");
    setFCalorVenda("");
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setModalOpen(true);
  }

  function openEdit(l: Lead) {
    setEditing(l);
    setFNome(l.nome ?? "");
    setFTelefone(l.telefone ?? "");
    setFEmail(l.email ?? "");
    setFRenda(l.rendaBruta != null ? String(l.rendaBruta) : "");
    setFEntrada(l.entrada != null ? String(l.entrada) : "");
    setFFgts(l.fgts != null ? String(l.fgts) : "");
    setFNascimento(l.dataNascimento ? l.dataNascimento.slice(0, 10) : "");
    setFOrigem(l.origem ?? "");
    setFInteresse(l.interesse ?? "");
    setFStatus(l.status ?? "CONTATO_INICIAL");
    setFContexto(l.contextoGeral ?? "");
    // datetime-local precisa de "YYYY-MM-DDTHH:mm"
    setFFollowUp(l.nextFollowUpAt ? l.nextFollowUpAt.slice(0, 16) : "");
    setFCalorVenda(l.calorVenda ?? "");
    setModalOpen(true);
    
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/crm/leads", { cache: "no-store" });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar leads.");

      setLeads(data.leads || []);
    } catch (e: any) {
      setError(e?.message || "Erro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const min = minRenda ? Number(minRenda) : null;
    const fromD = from ? new Date(from).getTime() : null;
    const toD = to ? new Date(to).getTime() : null;

    return leads.filter((l) => {
      const isExcluded = l.status === "EXCLUIDO";
      if (tab === "EXCLUIDOS" && !isExcluded) return false;
      if (tab === "ATIVOS" && isExcluded) return false;

      if (status !== "ALL" && l.status !== status) return false;

      if (qq) {
        const hay = `${l.nome} ${l.telefone || ""} ${l.email || ""} ${l.interesse || ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      if (min !== null && Number.isFinite(min)) {
        const renda = l.rendaBruta ?? 0;
        if (renda < min) return false;
      }

      if (fromD !== null) {
        const created = new Date(l.createdAt).getTime();
        if (created < fromD) return false;
      }
      if (toD !== null) {
        const created = new Date(l.createdAt).getTime();
        const end = toD + 24 * 60 * 60 * 1000 - 1;
        if (created > end) return false;
      }

      return true;
    });
  }, [leads, q, status, minRenda, from, to, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [q, status, minRenda, from, to, tab]);

  const statuses = useMemo(() => {
    const set = new Set(leads.map((l) => l.status));
    const arr = Array.from(set);

    const order = ["CONTATO_INICIAL", "STANDBY", "APROVADO", "VENDIDO", "EXCLUIDO"];
    arr.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    return ["ALL", ...arr];
  }, [leads]);

  async function saveLead() {
    const nome = fNome.trim();
    if (!nome) {
      setError("Nome é obrigatório.");
      return;
    }
    if (fContexto && fContexto.length > 1500) {
      setError("Contexto geral excede 1500 caracteres.");
      return;
    }

    const payload: any = {
      nome,
      telefone: fTelefone.trim() || null,
      email: fEmail.trim() ? fEmail.trim().toLowerCase() : null,
      rendaBruta: fRenda.trim() ? Number(fRenda) : null,
      entrada: fEntrada.trim() ? Number(fEntrada) : null,
      fgts: fFgts.trim() ? Number(fFgts) : null,
      dataNascimento: fNascimento ? new Date(fNascimento).toISOString() : null,
      origem: fOrigem || null,
      interesse: fInteresse.trim() || null,
      status: fStatus,
      contextoGeral: fContexto.trim() || null,
      // datetime-local => new Date("YYYY-MM-DDTHH:mm").toISOString()
      nextFollowUpAt: fFollowUp ? new Date(fFollowUp).toISOString() : null,
      calorVenda: fCalorVenda || null,
    };

    try {
      setSaving(true);
      setError(null);

      if (!editing) {
        const res = await fetch("/api/crm/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(data?.error || "Falha ao criar lead.");

        setModalOpen(false);
        await load();
        return;
      }

      const res = await fetch(`/api/crm/leads/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar lead.");

      setModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function hardDeleteLead(id: string) {
    if (!confirm("Tem certeza que deseja excluir este cliente? (apagar do sistema)")) return;

    try {
      setError(null);
      const res = await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao excluir.");
    }
  }

  async function softExcludeLead(id: string) {
    try {
      setError(null);
      const res = await fetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "EXCLUIDO" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir (status).");
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao excluir.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">CRM • Clientes</h1>
          <button
            className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
            onClick={openCreate}
          >
            + Novo cliente
          </button>
        </div>

        <button
          className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
          onClick={load}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`text-sm border rounded px-3 py-2 ${tab === "ATIVOS" ? "bg-gray-50" : "bg-white hover:bg-gray-50"}`}
          onClick={() => setTab("ATIVOS")}
        >
          Ativos
        </button>
        <button
          className={`text-sm border rounded px-3 py-2 ${tab === "EXCLUIDOS" ? "bg-gray-50" : "bg-white hover:bg-gray-50"}`}
          onClick={() => setTab("EXCLUIDOS")}
        >
          Excluídos
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Buscar por nome/telefone/email/interesse"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="border rounded px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "Status: Todos" : (STATUS_LABELS[s] || s)}
            </option>
          ))}
        </select>

        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Renda mínima"
          value={minRenda}
          onChange={(e) => setMinRenda(e.target.value)}
          inputMode="numeric"
        />

        <input
          className="border rounded px-3 py-2 text-sm"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="De (data de cadastro)"
        />

        <input
          className="border rounded px-3 py-2 text-sm"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          title="Até (data de cadastro)"
        />
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Lista */}
      <div className="grid grid-cols-1 gap-3">
        {pageItems.map((l) => {
          const overdue = isOverdue(l.nextFollowUpAt);

          const phone = l.telefone?.trim() || "";
          const wa = phone ? `https://wa.me/${normalizePhoneToWhatsApp(phone)}` : null;

          return (
            <div
              key={l.id}
              className={[
                "border rounded-lg p-4",
                statusColor(l.status),
                overdue ? "ring-1 ring-red-400 border-red-300" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{l.nome}</div>

                  <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {l.telefone && (
                      <span>
                        📞{" "}
                        {wa ? (
                          <a className="underline hover:no-underline" href={wa} target="_blank" rel="noreferrer">
                            {l.telefone}
                          </a>
                        ) : (
                          l.telefone
                        )}
                      </span>
                    )}
                    {l.email && <span>✉️ {l.email}</span>}
                    {l.rendaBruta != null && <span>Renda: {fmtMoney(l.rendaBruta)}</span>}
                    {l.entrada != null && <span>Entrada: {fmtMoney(l.entrada)}</span>}
                  </div>

                  {l.interesse && (
                    <div className="text-xs text-gray-700 mt-2">
                      <span className="text-gray-500">Interesse:</span> {l.interesse}
                    </div>
                  )}
                </div>

                <div className="text-right space-y-1">
  <div className="space-y-1">
    <div className="text-xs font-mono text-gray-700">
      {STATUS_LABELS[l.status] || l.status}
    </div>

    {l.calorVenda && (
      <div
        className={`inline-flex text-[10px] px-2 py-1 rounded font-semibold text-white ${
          l.calorVenda === "FRIO"
            ? "bg-slate-500"
            : l.calorVenda === "MORNO"
            ? "bg-yellow-500"
            : l.calorVenda === "QUENTE"
            ? "bg-orange-500"
            : "bg-red-600"
        }`}
      >
        {l.calorVenda === "MUITO_QUENTE" ? "MUITO QUENTE" : l.calorVenda}
      </div>
    )}
  </div>

  {l.nextFollowUpAt && (
    <div className={`text-xs ${overdue ? "text-red-700 font-semibold" : "text-gray-600"}`}>
      Follow-up: {fmtFollowup(l.nextFollowUpAt)}
      {overdue ? " (atrasado)" : ""}
    </div>
  )}

  <div className="flex gap-2 justify-end pt-1">
                    <button
                      className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                      onClick={() => openEdit(l)}
                    >
                      Editar
                    </button>

                    {l.status !== "EXCLUIDO" ? (
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                        onClick={() => softExcludeLead(l.id)}
                        title="Enviar para Excluídos (não apaga)"
                      >
                        Excluir
                      </button>
                    ) : (
                      <button
                        className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                        onClick={() => hardDeleteLead(l.id)}
                        title="Apagar do sistema (hard delete)"
                      >
                        Apagar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {l.contextoGeral && (
                <div className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">
                  {l.contextoGeral}
                </div>
              )}

              <div className="text-xs text-gray-500 mt-3 flex items-center justify-between">
                <span>Criado: {new Date(l.createdAt).toLocaleDateString()}</span>
                <span>Atualizado: {new Date(l.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          );
        })}

        {!loading && !error && filtered.length === 0 && (
          <div className="border rounded-lg p-6 text-sm text-gray-600">
            Nenhum lead encontrado com esses filtros.
          </div>
        )}
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-600">
          {filtered.length} lead(s) • Página {page} de {totalPages}
        </div>

        <div className="flex gap-2">
          <button
            className="text-sm border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ←
          </button>
          <button
            className="text-sm border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            →
          </button>
        </div>
      </div>

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setModalOpen(false)} />

          {/* container com altura máxima + layout flex */}
          <div className="relative w-full max-w-2xl rounded-xl bg-white border shadow-lg max-h-[90vh] flex flex-col">
            {/* header fixo */}
            <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
              <div className="font-semibold">
                {editing ? "Editar cliente" : "Novo cliente"}
              </div>
              <button
                className="text-sm border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Fechar
              </button>
            </div>

            {/* corpo rolável (resolve mobile) */}
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Nome (obrigatório)"
                  value={fNome}
                  onChange={(e) => setFNome(e.target.value)}
                />

                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Telefone"
                  value={fTelefone}
                  onChange={(e) => setFTelefone(e.target.value)}
                />

                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Email"
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                />

                <select
                  className="border rounded px-3 py-2 text-sm"
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                >
                  <option value="CONTATO_INICIAL">Contato inicial</option>
                  <option value="STANDBY">Standby</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="VENDIDO">Vendido</option>
                  <option value="EXCLUIDO">Excluído</option>
                </select>
                <select
  className="border rounded px-3 py-2 text-sm"
  value={fCalorVenda}
  onChange={(e) => setFCalorVenda(e.target.value)}
>
  <option value="">Calor de venda</option>
  <option value="FRIO">Frio</option>
  <option value="MORNO">Morno</option>
  <option value="QUENTE">Quente</option>
  <option value="MUITO_QUENTE">Muito quente</option>
</select>
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Renda bruta"
                  inputMode="numeric"
                  value={fRenda}
                  onChange={(e) => setFRenda(e.target.value)}
                />
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Entrada"
                  inputMode="numeric"
                  value={fEntrada}
                  onChange={(e) => setFEntrada(e.target.value)}
                />

                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="FGTS"
                  inputMode="numeric"
                  value={fFgts}
                  onChange={(e) => setFFgts(e.target.value)}
                />

                {/* Data de nascimento com label visível */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Data de nascimento</label>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    type="date"
                    value={fNascimento}
                    onChange={(e) => setFNascimento(e.target.value)}
                  />
                </div>

                <select
                  className="border rounded px-3 py-2 text-sm"
                  value={fOrigem}
                  onChange={(e) => setFOrigem(e.target.value)}
                >
                  <option value="">Origem (opcional)</option>
                  <option value="CAMPANHA_TRAFEGO">Campanha / Tráfego</option>
                  <option value="INDICACAO">Indicação</option>
                  <option value="LISTA">Lista</option>
                  <option value="ACAO_EXTERNA">Ação externa</option>
                </select>

                <input
                  className="border rounded px-3 py-2 text-sm md:col-span-1"
                  placeholder='Interesse (ex: "2Q região tal...")'
                  value={fInteresse}
                  onChange={(e) => setFInteresse(e.target.value)}
                />

                {/* Follow-up com label visível + hora */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Próximo follow-up (data e hora)</label>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    type="datetime-local"
                    value={fFollowUp}
                    onChange={(e) => setFFollowUp(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <textarea
                  className="border rounded px-3 py-2 text-sm w-full min-h-[140px]"
                  placeholder="Contexto geral (até 1500 caracteres)"
                  value={fContexto}
                  onChange={(e) => setFContexto(e.target.value)}
                  maxLength={1500}
                />
                <div className="text-xs text-gray-500 mt-1">{fContexto.length}/1500</div>
              </div>
            </div>

            {/* rodapé sticky (não some no mobile) */}
            <div className="px-5 py-4 border-t bg-white flex items-center justify-end gap-2 shrink-0">
              <button
                className="text-sm border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="text-sm border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                onClick={saveLead}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
