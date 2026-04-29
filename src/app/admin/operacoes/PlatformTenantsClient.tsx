"use client";

import { useEffect, useState } from "react";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  createdAt: string;
  _count: {
    users: number;
    construtoras: number;
    empreendimentos: number;
    crmleads: number;
  };
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function PlatformTenantsClient() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchTenants() {
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/platform/tenants/list", { cache: "no-store" });
      const data = await readJsonSafe(res);

      if (!res.ok) throw new Error(data?.error || "Falha ao carregar operações.");

      setTenants(data.tenants || []);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar operações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTenants();
  }, []);

  function onNameChange(value: string) {
    setTenantName(value);
    setTenantSlug(slugify(value));
  }

  async function createOperation() {
    setMsg(null);
    setBusy(true);

    try {
      const res = await fetch("/api/platform/tenants/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: tenantName.trim(),
          tenantSlug: tenantSlug.trim(),
          tenantType: "IMOBILIARIA",
          ownerEmail: ownerEmail.trim().toLowerCase(),
          ownerRole: "OWNER",
        }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) throw new Error(data?.error || "Falha ao criar operação.");

      setMsg("Operação criada e convite enviado.");
      setTenantName("");
      setTenantSlug("");
      setOwnerEmail("");
      setOpen(false);

      await fetchTenants();
    } catch (e: any) {
      setMsg(e?.message || "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operações</h1>
          <p className="text-sm text-gray-600">
            Crie operações regionais e convide o Owner responsável.
          </p>
        </div>

        <button
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
          className="px-4 py-2 rounded border hover:bg-gray-50"
        >
          + Nova operação
        </button>
      </div>

      {msg && (
        <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {msg}
        </div>
      )}

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Operação</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Usuários</th>
              <th className="p-3">Construtoras</th>
              <th className="p-3">Empreendimentos</th>
              <th className="p-3">Leads</th>
              <th className="p-3">Criada</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={7}>
                  Carregando...
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={7}>
                  Nenhuma operação criada.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3 font-mono">{t.slug}</td>
                  <td className="p-3">{t._count.users}</td>
                  <td className="p-3">{t._count.construtoras}</td>
                  <td className="p-3">{t._count.empreendimentos}</td>
                  <td className="p-3">{t._count.crmleads}</td>
                  <td className="p-3">
                    {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg border w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Nova operação</h2>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded border hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-600">Nome da operação</label>
              <input
                value={tenantName}
                onChange={(e) => onNameChange(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded border"
                placeholder="Operação Rio"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Slug</label>
              <input
                value={tenantSlug}
                onChange={(e) => setTenantSlug(slugify(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded border font-mono"
                placeholder="operacao-rio"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">E-mail do Owner</label>
              <input
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded border"
                placeholder="owner@exemplo.com"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded border hover:bg-gray-50"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                onClick={createOperation}
                className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
                disabled={busy || !tenantName || !tenantSlug || !ownerEmail}
              >
                {busy ? "Criando..." : "Criar operação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}