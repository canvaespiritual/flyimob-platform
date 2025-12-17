"use client";

import { useEffect, useMemo, useState } from "react";

type Foto = {
  urlFull: string;
  urlThumb: string;
};

export default function PhotoGallery({
  fotos,
  title,
}: {
  fotos: Foto[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const total = fotos.length;
  const cover = fotos[0];
  const thumbs = fotos.slice(1, 5); // mais 4 além da capa
  const remaining = Math.max(0, total - 5);

  const fullUrls = useMemo(() => fotos.map((f) => f.urlFull), [fotos]);

  function openAt(i: number) {
    setIdx(i);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function prev() {
    setIdx((i) => (i - 1 + total) % total);
  }

  function next() {
    setIdx((i) => (i + 1) % total);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, total]);

  if (!total) {
    return (
      <div className="border rounded bg-gray-100 h-[360px] flex items-center justify-center text-gray-400">
        Sem fotos
      </div>
    );
  }

  return (
    <>
      {/* GRID estilo Órulo: capa + 2 em cima + 2 embaixo (ou 4 thumbs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* capa */}
        <button
          type="button"
          onClick={() => openAt(0)}
          className="border rounded overflow-hidden bg-gray-100 text-left"
          title="Ver fotos"
        >
          <img
            src={cover.urlFull}
            alt=""
            className="w-full h-[360px] object-cover"
          />
        </button>

        {/* thumbs */}
        <div className="grid grid-cols-2 gap-3">
          {thumbs.map((f, i) => {
            const realIndex = i + 1;
            return (
              <button
                key={f.urlThumb}
                type="button"
                onClick={() => openAt(realIndex)}
                className="border rounded overflow-hidden bg-gray-100 text-left"
                title="Ver fotos"
              >
                <img src={f.urlThumb} alt="" className="w-full h-[172px] object-cover" />
              </button>
            );
          })}

          {/* botão “ver restantes” (aparece no último slot se tiver mais) */}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => openAt(0)}
              className="border rounded overflow-hidden bg-gray-900/70 hover:bg-gray-900 text-white flex items-center justify-center h-[172px]"
              title="Ver todas as fotos"
            >
              Ver +{remaining} fotos
            </button>
          )}
        </div>
      </div>

      {/* MODAL / SLIDESHOW */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            // fecha clicando fora da imagem
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-6xl">
            {/* topo */}
            <div className="flex items-center justify-between text-white mb-2">
              <div className="text-sm">
                {title ? <span className="font-medium">{title}</span> : null}
                <span className="opacity-80"> • {idx + 1}/{total}</span>
              </div>

              <button
                type="button"
                onClick={close}
                className="border border-white/30 rounded px-3 py-1 hover:bg-white/10"
              >
                Fechar ✕
              </button>
            </div>

            {/* imagem */}
            <div className="relative bg-black rounded overflow-hidden border border-white/10">
              <img
                src={fullUrls[idx]}
                alt=""
                className="w-full max-h-[75vh] object-contain bg-black"
              />

              {/* setas */}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded px-3 py-2"
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded px-3 py-2"
                    aria-label="Próxima"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {/* mini-thumbs do modal */}
            {total > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {fotos.map((f, i) => (
                  <button
                    key={f.urlThumb + i}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`border rounded overflow-hidden flex-shrink-0 ${
                      i === idx ? "border-white" : "border-white/20"
                    }`}
                    title={`Foto ${i + 1}`}
                  >
                    <img src={f.urlThumb} alt="" className="w-20 h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
