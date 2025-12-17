"use client";

import { useState } from "react";

type Foto = {
  id: string;
  urlFull: string;
  urlThumb: string;
  ordem: number;
  isCover: boolean;
};

type Anexo = {
  id: string;
  tipo: string;
  titulo: string | null;
  url: string;
};

export default function MidiasClient({
  tenantSlug,
  empreendimentoId,
  fotos,
  anexos,
}: {
  tenantSlug: string;
  empreendimentoId: string;
  fotos: Foto[];
  anexos: Anexo[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function uploadFotos() {
    if (!files.length) return alert("Selecione ao menos uma foto.");

    const form = new FormData();
    form.append("tenantSlug", tenantSlug);
    form.append("empreendimentoId", empreendimentoId);
    form.append("coverIndex", String(coverIndex));
    files.forEach((f) => form.append("files", f));

    setUploading(true);
    const res = await fetch("/api/empreendimentos/fotos/upload", {
      method: "POST",
      body: form,
    });
    setUploading(false);

    if (!res.ok) {
      alert("Erro ao subir fotos.");
      return;
    }

    window.location.reload();
  }

  async function uploadAnexo(file: File, tipo: string, titulo: string) {
    const form = new FormData();
    form.append("tenantSlug", tenantSlug);
    form.append("empreendimentoId", empreendimentoId);
    form.append("tipo", tipo);
    form.append("titulo", titulo);
    form.append("file", file);

    const res = await fetch("/api/empreendimentos/anexos/upload", {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      alert("Erro ao subir anexo.");
      return;
    }

    window.location.reload();
  }

  async function setCover(fotoId: string) {
    const res = await fetch("/api/empreendimentos/fotos/set-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug, empreendimentoId, fotoId }),
    });

    if (!res.ok) {
      alert("Erro ao definir capa.");
      return;
    }

    window.location.reload();
  }

  async function deleteFoto(fotoId: string) {
    if (!confirm("Remover esta foto?")) return;

    const res = await fetch("/api/empreendimentos/fotos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug, empreendimentoId, fotoId }),
    });

    if (!res.ok) {
      alert("Erro ao remover foto.");
      return;
    }

    window.location.reload();
  }
async function deleteAnexo(anexoId: string) {
  if (!confirm("Remover este anexo?")) return;

  const res = await fetch("/api/empreendimentos/anexos/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantSlug, empreendimentoId, anexoId }),
  });

  if (!res.ok) {
    alert("Erro ao remover anexo.");
    return;
  }

  window.location.reload();
}

  return (
    <div className="space-y-8">
      {/* UPLOAD DE FOTOS */}
      <section className="border rounded p-4">
        <h2 className="font-semibold mb-2">Fotos</h2>

        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            const arr = Array.from(e.target.files || []);
            setFiles(arr);
            setCoverIndex(0);
          }}
        />

        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-sm text-gray-600">
              (Opcional) Escolha a foto de capa para este upload:
            </div>

            {files.map((f, i) => (
              <label key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={coverIndex === i}
                  onChange={() => setCoverIndex(i)}
                />
                {f.name}
              </label>
            ))}
          </div>
        )}

        <button
          onClick={uploadFotos}
          disabled={uploading}
          className="mt-3 border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "Enviando..." : "Enviar fotos"}
        </button>

        <div className="text-xs text-gray-500 mt-2">
          Você também pode definir a capa depois do upload na galeria.
        </div>
      </section>

      {/* GALERIA */}
      <section>
        <h2 className="font-semibold mb-2">Galeria</h2>

        {fotos.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhuma foto ainda.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fotos.map((f) => (
              <div key={f.id} className="border rounded p-2">
                <a href={f.urlFull} target="_blank" rel="noreferrer">
                  <img
                    src={f.urlThumb}
                    alt=""
                    className="w-full h-32 object-cover rounded"
                  />
                </a>

                <div className="flex items-center justify-between mt-2">
                  {f.isCover ? (
                    <div className="text-xs text-green-700">Capa ✅</div>
                  ) : (
                    <button
                      onClick={() => setCover(f.id)}
                      className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                    >
                      Tornar capa
                    </button>
                  )}

                  <button
                    onClick={() => deleteFoto(f.id)}
                    className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                    title="Remover"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ANEXOS */}
      <section className="border rounded p-4">
        <h2 className="font-semibold mb-2">Anexos</h2>

        <input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAnexo(f, "GERAL", f.name);
          }}
        />

        {anexos.length === 0 ? (
          <div className="text-sm text-gray-500 mt-2">Nenhum anexo ainda.</div>
        ) : (
          <ul className="mt-3 space-y-1">
  {anexos.map((a) => (
    <li key={a.id} className="flex items-center justify-between gap-3">
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 underline"
      >
        {a.titulo || a.tipo}
      </a>

      <button
        onClick={() => deleteAnexo(a.id)}
        className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
      >
        Remover
      </button>
    </li>
  ))}
</ul>

        )}
      </section>
    </div>
  );
}
