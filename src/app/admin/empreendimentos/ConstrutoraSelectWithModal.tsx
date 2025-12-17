"use client";

import { useEffect, useState } from "react";

type Construtora = {
  id: string;
  name: string;
};

export default function ConstrutoraSelectWithModal({
  tenantSlug,
  initialConstrutoras,
}: {
  tenantSlug: string;
  initialConstrutoras: Construtora[];
}) {
  const [construtoras, setConstrutoras] = useState<Construtora[]>(initialConstrutoras);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshList() {
    const r = await fetch(`/api/construtoras/list?tenantSlug=${tenantSlug}`);
    if (r.ok) {
      const data = await r.json();
      setConstrutoras(data);
    }
  }

  async function createConstrutora() {
    if (!name.trim()) {
      alert("Informe o nome da construtora.");
      return;
    }

    setLoading(true);
    const r = await fetch("/api/construtoras/create-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantSlug,
        name,
        responsavelComercial: responsavel || null,
        whatsappComercial: whatsapp || null,
      }),
    });
    setLoading(false);

    if (!r.ok) {
      alert("Erro ao criar construtora.");
      return;
    }

    const created = await r.json();
    setConstrutoras((prev) => [...prev, created]);
    setSelected(created.id);
    setOpen(false);

    setName("");
    setResponsavel("");
    setWhatsapp("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">Construtora</label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshList}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
          >
            ↻ Atualizar
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
          >
            + Nova
          </button>
        </div>
      </div>

      <select
        name="construtoraId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="border rounded px-3 py-2 w-full"
      >
        <option value="">Sem construtora (revenda/particular)</option>
        {construtoras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded w-full max-w-md p-4">
            <div className="font-semibold mb-3">Cadastrar construtora</div>

            <div className="space-y-3">
              <input
                placeholder="Nome da construtora*"
                className="border rounded px-3 py-2 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <input
                placeholder="Responsável comercial"
                className="border rounded px-3 py-2 w-full"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />

              <input
                placeholder="WhatsApp comercial"
                className="border rounded px-3 py-2 w-full"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border rounded px-4 py-2 hover:bg-gray-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={createConstrutora}
                  disabled={loading}
                  className="border rounded px-4 py-2 bg-gray-900 text-white"
                >
                  {loading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
