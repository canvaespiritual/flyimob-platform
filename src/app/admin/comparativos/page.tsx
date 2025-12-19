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
          <table className="w-full text-sm">
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
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => copyLink(c.slugPublico)}
                      className="text-blue-600 hover:underline"
                    >
                      Copiar link
                    </button>
                    <Link
                      href={`/admin/comparativos/${c.id}`}
                      className="text-black hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
