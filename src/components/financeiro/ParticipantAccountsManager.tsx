"use client";

import { useState } from "react";

import ParticipantAccountForm from "./ParticipantAccountForm";

type Account = {
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

export default function ParticipantAccountsManager({
  participantId,
  accounts,
}: {
  participantId: string;
  accounts: Account[];
}) {
  const [adding, setAdding] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">
            Dados para pagamento
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            PIX e contas informadas pelo participante.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Adicionar conta / PIX
        </button>
      </div>

      {adding && (
        <ParticipantAccountForm
          participantId={participantId}
          onCancel={() =>
            setAdding(false)
          }
        />
      )}

      {accounts.length === 0 &&
        !adding && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
            Nenhum dado de pagamento cadastrado.
          </div>
        )}

      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-lg border bg-white p-4"
          >
            {editingId === account.id ? (
              <ParticipantAccountForm
                participantId={
                  participantId
                }
                initialData={account}
                onCancel={() =>
                  setEditingId(null)
                }
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-gray-900">
                      {account.pixKey
                        ? `PIX ${account.pixType ?? ""}`
                        : account.bankName ||
                          "Conta bancária"}
                    </div>

                    {account.preferred && (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        Preferencial
                      </span>
                    )}

                    {!account.active && (
                      <span className="rounded-full border bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                        Inativa
                      </span>
                    )}
                  </div>

                  {account.pixKey && (
                    <div className="mt-2 text-sm text-gray-700">
                      {account.pixKey}
                    </div>
                  )}

                  {(account.bankName ||
                    account.agency ||
                    account.account) && (
                    <div className="mt-2 text-sm text-gray-600">
                      {[
                        account.bankName,
                        account.agency
                          ? `Ag. ${account.agency}`
                          : null,
                        account.account
                          ? `Conta ${account.account}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}

                  {account.holderName && (
                    <div className="mt-1 text-xs text-gray-500">
                      Titular:{" "}
                      {account.holderName}
                      {account.holderCpfCnpj
                        ? ` • ${account.holderCpfCnpj}`
                        : ""}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(
                      account.id
                    );
                  }}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}