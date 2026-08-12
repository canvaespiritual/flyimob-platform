"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ParticipantInitialData = {
  id: string;
  userId: string | null;
  name: string;
  cpfCnpj: string | null;
  email: string | null;
  phone: string | null;
  defaultCalculationBasis: string | null;
  defaultPercentage: string | null;
  active: boolean;
  notes: string | null;
};

export default function ParticipantForm({
  users,
  initialData,
}: {
  users: UserOption[];
  initialData?: ParticipantInitialData;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(initialData?.id);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);

      const payload = {
        id: initialData?.id ?? null,

        userId:
          String(form.get("userId") || "").trim() ||
          null,

        name:
          String(form.get("name") || "").trim(),

        cpfCnpj:
          String(form.get("cpfCnpj") || "").trim() ||
          null,

        email:
          String(form.get("email") || "").trim() ||
          null,

        phone:
          String(form.get("phone") || "").trim() ||
          null,

        defaultCalculationBasis:
          String(
            form.get("defaultCalculationBasis") || ""
          ).trim() || null,

        defaultPercentage:
          String(
            form.get("defaultPercentage") || ""
          ).trim() || null,

        active:
          form.get("active") === "on",

        notes:
          String(form.get("notes") || "").trim() ||
          null,
      };

      const endpoint = editing
        ? "/api/financeiro/participantes/update"
        : "/api/financeiro/participantes/create";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível salvar o participante."
        );
      }

      router.push(
  `/admin/financeiro/participantes/${data.participant.id}`
);
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
      className="space-y-6"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold text-gray-900">
            Dados do participante
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Corretor, gerente, operador, indicador ou
            outro participante financeiro.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Nome *
            </span>

            <input
              name="name"
              required
              defaultValue={initialData?.name ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Usuário Flyimob
            </span>

            <select
              name="userId"
              defaultValue={initialData?.userId ?? ""}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">
                Não vincular a usuário
              </option>

              {users.map((user) => (
                <option
                  key={user.id}
                  value={user.id}
                >
                  {user.name} — {user.role} —{" "}
                  {user.email}
                </option>
              ))}
            </select>

            <p className="text-xs text-gray-500">
              É opcional. Participantes externos não
              precisam ter login.
            </p>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              CPF / CNPJ
            </span>

            <input
              name="cpfCnpj"
              defaultValue={initialData?.cpfCnpj ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Telefone / WhatsApp
            </span>

            <input
              name="phone"
              defaultValue={initialData?.phone ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              E-mail
            </span>

            <input
              name="email"
              type="email"
              defaultValue={initialData?.email ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </label>

          <div />

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Regra padrão de comissão
            </span>

            <select
              name="defaultCalculationBasis"
              defaultValue={
                initialData?.defaultCalculationBasis ??
                ""
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">
                Sem regra padrão
              </option>

              <option value="COMMISSION_GROSS">
                % da comissão bruta
              </option>

              <option value="COMMISSION_NET_AFTER_WITHHOLDING">
                % após retenção na fonte
              </option>

              <option value="COMMISSION_NET_AFTER_ALL_TAXES">
                % após todos os impostos
              </option>

              <option value="VGV">
                % do VGV
              </option>

              <option value="FIXED">
                Valor fixo
              </option>

              <option value="MANUAL">
                Valor manual
              </option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Percentual padrão
            </span>

            <div className="relative">
              <input
                name="defaultPercentage"
                inputMode="decimal"
                defaultValue={
                  initialData?.defaultPercentage ?? ""
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-9 text-sm outline-none focus:border-gray-500"
              />

              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                %
              </span>
            </div>
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
              Participante ativo
            </span>
          </label>

          <div />

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">
              Observações
            </span>

            <textarea
              name="notes"
              rows={4}
              defaultValue={initialData?.notes ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "Salvando..."
            : editing
              ? "Salvar alterações"
              : "Cadastrar participante"}
        </button>
      </div>
    </form>
  );
}