"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Attachment = {
  id: string;
  type: string;
  title:
    | string
    | null;
  originalName:
    string;
  url: string;
  mimeType:
    | string
    | null;
  sizeBytes:
    | number
    | null;
  createdAt:
    | string
    | Date;
};

export default function FinancialAttachmentsManager({
  entityType,
  entityId,
  attachmentType,
  initialAttachments = [],
  title = "Comprovantes",
  compact = false,
  readOnly = false,
  onChanged,
}: {
  entityType:
    | "PAYMENT"
    | "ADJUSTMENT"
    | "INVOICE"
    | "RECEIPT"
    | "TAX_ENTRY"
    | "TAX_CLOSING"
    | "TAX_MOVEMENT";
  entityId: string;
  attachmentType:
    | "INVOICE"
    | "BUILDER_RECEIPT"
    | "PARTICIPANT_PAYMENT"
    | "ADVANCE"
    | "TAX_DOCUMENT"
    | "TAX_PAYMENT"
    | "OTHER";
  initialAttachments?:
    Attachment[];
  title?: string;
  compact?: boolean;
  readOnly?: boolean;
  onChanged?:
    () =>
      void;
}) {
  const [
    attachments,
    setAttachments,
  ] =
    useState<
      Attachment[]
    >(
      initialAttachments.map(
        (
          item
        ) => ({
          ...item,
          createdAt:
            typeof item.createdAt ===
            "string"
              ? item.createdAt
              : item.createdAt.toISOString(),
        })
      )
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      initialAttachments.length ===
        0
    );

  const [
    uploading,
    setUploading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    open,
    setOpen,
  ] =
    useState(
      !compact
    );

  const fileRef =
    useRef<HTMLInputElement>(
      null
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const params =
            new URLSearchParams({
              entityType,
              entityId,
              type:
                attachmentType,
            });

          const response =
            await fetch(
              `/api/financeiro/anexos/list?${params.toString()}`,
              {
                cache:
                  "no-store",
              }
            );

          const json =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              json?.error ||
                "Erro ao carregar anexos."
            );
          }

          setAttachments(
            json.attachments ||
              []
          );
        } catch (
          err
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro inesperado."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        entityType,
        entityId,
        attachmentType,
      ]
    );

  useEffect(() => {
    load();
  }, [
    load,
  ]);

  async function upload(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      readOnly
    ) {
      return;
    }

    const form =
      event.currentTarget;

    const formData =
      new FormData(
        form
      );

    const file =
      formData.get(
        "file"
      ) as File | null;

    if (
      !file ||
      file.size ===
        0
    ) {
      setError(
        "Selecione um arquivo."
      );
      return;
    }

    formData.set(
      "entityType",
      entityType
    );

    formData.set(
      "entityId",
      entityId
    );

    formData.set(
      "type",
      attachmentType
    );

    setUploading(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/anexos/upload",
          {
            method:
              "POST",
            body:
              formData,
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao enviar arquivo."
        );
      }

      form.reset();

      if (
        fileRef.current
      ) {
        fileRef.current.value =
          "";
      }

      await load();

      onChanged?.();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setUploading(
        false
      );
    }
  }

  async function remove(
    id: string
  ) {
    if (
      readOnly
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Excluir este arquivo?"
      );

    if (
      !confirmed
    ) {
      return;
    }

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/anexos/delete",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                id,
              }),
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao excluir."
        );
      }

      await load();

      onChanged?.();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    }
  }

  const count =
    attachments.length;

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-gray-900">
              {title}
            </div>

            {!loading &&
              count ===
                0 && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  Sem comprovante
                </span>
              )}

            {!loading &&
              count >
                0 && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                  Comprovante ok •{" "}
                  {count}
                </span>
              )}
          </div>

          {!compact && (
            <div className="mt-1 text-xs text-gray-500">
              {readOnly
                ? "Arquivos preservados no histórico deste lançamento."
                : "Você pode anexar vários arquivos ao mesmo lançamento."}
            </div>
          )}
        </div>

        {compact && (
          <button
            type="button"
            onClick={() =>
              setOpen(
                (
                  current
                ) =>
                  !current
              )
            }
            className="text-xs font-medium underline"
          >
            {open
              ? "Fechar"
              : count >
                  0
                ? "Ver comprovantes"
                : readOnly
                  ? "Ver"
                  : "Anexar"}
          </button>
        )}
      </div>

      {open && (
        <>
          {loading ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              Carregando comprovantes...
            </div>
          ) : (
            <>
              {attachments.length >
              0 ? (
                <div className="divide-y">
                  {attachments.map(
                    (
                      attachment
                    ) => (
                      <div
                        key={
                          attachment.id
                        }
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <a
                            href={
                              attachment.url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-gray-900 underline"
                          >
                            {attachment.title ||
                              attachment.originalName}
                          </a>

                          {attachment.title && (
                            <div className="mt-1 text-xs text-gray-500">
                              {
                                attachment.originalName
                              }
                            </div>
                          )}
                        </div>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              remove(
                                attachment.id
                              )
                            }
                            className="text-xs font-medium text-red-600"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 text-xs text-amber-700">
                  Nenhum comprovante anexado a este lançamento.
                </div>
              )}
            </>
          )}

          {!readOnly && (
            <form
              onSubmit={
                upload
              }
              className="space-y-3 border-t bg-gray-50 p-4"
            >
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-[1fr_1.3fr_auto]">
                <input
                  name="title"
                  placeholder="Descrição / observação. Ex.: comprovante principal"
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />

                <input
                  ref={
                    fileRef
                  }
                  name="file"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  required
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />

                <button
                  disabled={
                    uploading
                  }
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {uploading
                    ? "Enviando..."
                    : "Adicionar"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
