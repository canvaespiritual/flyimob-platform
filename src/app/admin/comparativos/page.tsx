"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Comparativo = {
  id: string;
  titulo: string;
  clienteNome: string;
  slugPublico: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    items: number;
  };
};

export default function AdminComparativosPage() {
  const [comparativos, setComparativos] = useState<Comparativo[]>([]);
  const [loading, setLoading] = useState(true);

  const [titulo, setTitulo] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
const [deleteCheck, setDeleteCheck] = useState(false);
const [deleting, setDeleting] = useState(false);


  async function load() {
    setLoading(true);
    const res = await fetch("/api/comparativos/list");
    const json = await res.json();
    setComparativos(json.comparativos ?? []);
    setLoading(false);
  }

  async function create() {
    if (!titulo || !clienteNome) {
      alert("Informe o título e o nome do cliente.");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/comparativos/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, clienteNome }),
    });

    const json = await res.json();
    setCreating(false);

    if (!json.ok) {
      alert(json.error || "Erro ao criar comparativo.");
      return;
    }

    setTitulo("");
    setClienteNome("");
    await load();
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/c/${slug}`;
    navigator.clipboard.writeText(url);
    alert("Link copiado!");
  }
async function duplicateComparativo(id: string) {
  const res = await fetch("/api/comparativos/duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    alert(json.error || "Erro ao duplicar comparativo.");
    return;
  }

  await load();
}

async function deleteComparativo(id: string) {
  setDeleting(true);
  const res = await fetch("/api/comparativos/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = await res.json().catch(() => ({}));
  setDeleting(false);

  if (!json.ok) {
    alert(json.error || "Erro ao excluir comparativo.");
    return;
  }

  setConfirmDeleteId(null);
  setDeleteCheck(false);
  await load();
}

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comparativos</h1>
        <p className="text-sm text-gray-500">
          Comparativos personalizados por cliente
        </p>
      </div>

      {/* Criar novo */}
      <div className="border rounded-lg p-4 space-y-3 bg-white">
        <h2 className="font-medium">Novo comparativo</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Título do comparativo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Nome do cliente"
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
          />
          <button
            onClick={create}
            disabled={creating}
            className="bg-black text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {creating ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="border rounded-lg bg-white">
        {loading ? (
  <div className="p-4 text-sm text-gray-500">Carregando...</div>
) : comparativos.length === 0 ? (
  <div className="p-4 text-sm text-gray-500">
    Nenhum comparativo criado ainda.
  </div>
) : (
  <>
    {/* ================= MOBILE (cards) ================= */}
    <div className="md:hidden divide-y">
      {comparativos.map((c) => (
        <div key={c.id} className="p-4 space-y-2">
          <div className="font-medium">{c.titulo}</div>
          <div className="text-sm text-gray-600">{c.clienteNome}</div>
          <div className="text-xs text-gray-500">
            Itens: {c._count?.items ?? 0}
          </div>

          {confirmDeleteId === c.id ? (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={deleteCheck}
                  onChange={(e) => setDeleteCheck(e.target.checked)}
                />
                Confirmar exclusão
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!deleteCheck || deleting}
                  onClick={() => deleteComparativo(c.id)}
                  className="border rounded px-3 py-2 text-sm text-red-600 disabled:opacity-40"
                >
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>

                <button
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setDeleteCheck(false);
                  }}
                  className="border rounded px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => copyLink(c.slugPublico)}
                className="border rounded px-3 py-2 text-sm"
              >
                Copiar link
              </button>

              <Link
                href={`/admin/comparativos/${c.id}`}
                className="border rounded px-3 py-2 text-sm text-center"
              >
                Abrir
              </Link>

              <button
                onClick={() => duplicateComparativo(c.id)}
                className="border rounded px-3 py-2 text-sm"
              >
                Duplicar
              </button>

              <button
                onClick={() => {
                  setConfirmDeleteId(c.id);
                  setDeleteCheck(false);
                }}
                className="border rounded px-3 py-2 text-sm text-red-600"
              >
                Excluir
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    {/* ================= DESKTOP (tabela) ================= */}
    <div className="hidden md:block overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2">Título</th>
            <th className="text-left px-4 py-2">Cliente</th>
            <th className="text-center px-4 py-2">Itens</th>
            <th className="text-right px-4 py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {comparativos.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="px-4 py-2">{c.titulo}</td>
              <td className="px-4 py-2">{c.clienteNome}</td>
              <td className="px-4 py-2 text-center">
                {c._count?.items ?? 0}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {confirmDeleteId === c.id ? (
                  <div className="inline-flex items-center gap-3 justify-end">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={deleteCheck}
                        onChange={(e) => setDeleteCheck(e.target.checked)}
                      />
                      Confirmar exclusão
                    </label>

                    <button
                      disabled={!deleteCheck || deleting}
                      onClick={() => deleteComparativo(c.id)}
                      className="text-red-600 disabled:opacity-40"
                    >
                      {deleting ? "Excluindo..." : "Excluir"}
                    </button>

                    <button
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setDeleteCheck(false);
                      }}
                      className="text-gray-500"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex gap-3 justify-end">
                    <button
                      onClick={() => copyLink(c.slugPublico)}
                      className="text-blue-600 hover:underline"
                    >
                      Copiar link
                    </button>

                    <button
                      onClick={() => duplicateComparativo(c.id)}
                      className="text-black hover:underline"
                    >
                      Duplicar
                    </button>

                    <Link
                      href={`/admin/comparativos/${c.id}`}
                      className="text-black hover:underline"
                    >
                      Abrir
                    </Link>

                    <button
                      onClick={() => {
                        setConfirmDeleteId(c.id);
                        setDeleteCheck(false);
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
)}

      </div>
    </div>
  );
}
