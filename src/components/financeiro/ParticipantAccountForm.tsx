"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type InitialAccount = {
  id: string;
  pixType: string | null;
  pixKey: string | null;
  bankName: string | null;
  agency: string | null;
  account: string | null;
  accountType: string | null;
  holderName: string | null;
  holderCpfCnpj: string | null;
  preferred: boolean;
  active: boolean;
  notes: string | null;
};

export default function ParticipantAccountForm({
  participantId,
  initialData,
  onCancel,
}: {
  participantId: string;
  initialData?: InitialAccount;
  onCancel?: () => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

  const editing = Boolean(initialData?.id);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const formElement = event.currentTarget;

    setLoading(true);
    setError(null);

    try {
      const form = new FormData(formElement);

      const body = {
        id: initialData?.id ?? null,
        participantId,

        pixType:
          String(form.get("pixType") || "").trim() ||
          null,

        pixKey:
          String(form.get("pixKey") || "").trim() ||
          null,

        bankName:
          String(form.get("bankName") || "").trim() ||
          null,

        agency:
          String(form.get("agency") || "").trim() ||
          null,

        account:
          String(form.get("account") || "").trim() ||
          null,

        accountType:
          String(
            form.get("accountType") || ""
          ).trim() || null,

        holderName:
          String(
            form.get("holderName") || ""
          ).trim() || null,

        holderCpfCnpj:
          String(
            form.get("holderCpfCnpj") || ""
          ).trim() || null,

        preferred:
          form.get("preferred") === "on",

        active:
          form.get("active") === "on",

        notes:
          String(form.get("notes") || "").trim() ||
          null,
      };

      const endpoint = editing
        ? "/api/financeiro/contas-participante/update"
        : "/api/financeiro/contas-participante/create";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível salvar os dados bancários."
        );
      }

      router.refresh();

      if (!editing) {
    formElement.reset();
    }

      onCancel?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-gray-50 p-4"
    >
      <div>
        <div className="font-medium text-gray-900">
          {editing
            ? "Editar dados de pagamento"
            : "Adicionar dados de pagamento"}
        </div>

        <div className="mt-1 text-xs text-gray-500">
          Pode cadastrar PIX, conta bancária ou ambos.
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Tipo de PIX
          </span>

          <select
            name="pixType"
            defaultValue={initialData?.pixType ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">Sem PIX</option>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
            <option value="EMAIL">E-mail</option>
            <option value="PHONE">Telefone</option>
            <option value="RANDOM">
              Chave aleatória
            </option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Chave PIX
          </span>

          <input
            name="pixKey"
            defaultValue={initialData?.pixKey ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Banco
          </span>

          <input
            name="bankName"
            defaultValue={initialData?.bankName ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Tipo de conta
          </span>

          <select
            name="accountType"
            defaultValue={
              initialData?.accountType ?? ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">Selecione</option>
            <option value="CORRENTE">
              Conta corrente
            </option>
            <option value="POUPANCA">
              Poupança
            </option>
            <option value="PAGAMENTO">
              Conta de pagamento
            </option>
            <option value="OUTRA">Outra</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Agência
          </span>

          <input
            name="agency"
            defaultValue={initialData?.agency ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Conta
          </span>

          <input
            name="account"
            defaultValue={initialData?.account ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Nome do titular
          </span>

          <input
            name="holderName"
            defaultValue={
              initialData?.holderName ?? ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">
            CPF/CNPJ do titular
          </span>

          <input
            name="holderCpfCnpj"
            defaultValue={
              initialData?.holderCpfCnpj ?? ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="preferred"
            defaultChecked={
              initialData?.preferred ?? false
            }
          />

          <span className="text-sm text-gray-700">
            Usar como conta preferencial
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="active"
            defaultChecked={
              initialData?.active ?? true
            }
          />

          <span className="text-sm text-gray-700">
            Conta ativa
          </span>
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-gray-600">
            Observação
          </span>

          <textarea
            name="notes"
            rows={2}
            defaultValue={initialData?.notes ?? ""}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            Cancelar
          </button>
        )}

        <button
          disabled={loading}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "Salvando..."
            : "Salvar dados"}
        </button>
      </div>
    </form>
  );
}