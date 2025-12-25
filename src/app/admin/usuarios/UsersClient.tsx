// src/app/admin/usuarios/UsersClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRole } from "@prisma/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  whatsapp?: string | null;
  telefone?: string | null;
  creci?: string | null;
  observacao?: string | null;
};

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Owner",
  DIRECTOR: "Diretor",
  MANAGER: "Manager",
  BROKER: "Corretor",
  DATA_ENTRY: "Operador",
};

export default function UsersClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // modal convite (simples)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("BROKER");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao carregar usuários.");
      setRows(j.users || []);
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const activeCount = useMemo(() => rows.filter((u) => u.isActive).length, [rows]);

  const toggleActive = async (id: string, isActive: boolean) => {
    const next = !isActive;
    // otimista
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: next } : u)));

    const r = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });

    if (!r.ok) {
      // rollback
      setRows((prev) => prev.map((u) => (u.id === id ? { ...u, isActive } : u)));
      const j = await r.json().catch(() => ({}));
      alert(j?.error || "Não foi possível atualizar o usuário.");
    }
  };

  const sendInvite = async () => {
    setInviteMsg(null);
    setInviteBusy(true);
    try {
      const email = inviteEmail.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        setInviteMsg("Digite um e-mail válido.");
        return;
      }

      const r = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: inviteRole,
          // Como estamos dentro do tenant do usuário logado,
          // o backend usa o tenant do session para criar o invite.
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao enviar convite.");

      setInviteMsg("Convite enviado (se o e-mail existir e tiver permissão).");
      setInviteEmail("");
      setInviteRole("BROKER");
      setInviteOpen(false);
      await fetchUsers();
    } catch (e: any) {
      setInviteMsg(e?.message || "Erro inesperado ao convidar.");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {loading ? "Carregando..." : `${rows.length} usuários (${activeCount} ativos)`}
        </div>

        <button
          onClick={() => {
            setInviteMsg(null);
            setInviteOpen(true);
          }}
          className="px-3 py-2 rounded border hover:bg-gray-50"
        >
          Convidar usuário
        </button>
      </div>

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Função</th>
              <th className="p-3">Status</th>
              <th className="p-3">Criado</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={6}>
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{ROLE_LABEL[u.role]}</td>
                  <td className="p-3">
                    {u.isActive ? (
                      <span className="inline-flex px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 rounded bg-gray-100 text-gray-600 border">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggleActive(u.id, u.isActive)}
                      className="px-3 py-2 rounded border hover:bg-gray-50"
                    >
                      {u.isActive ? "Inativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal simples */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Convidar usuário</h2>
              <button
                onClick={() => setInviteOpen(false)}
                className="px-2 py-1 rounded border hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-600">E-mail</label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 rounded border"
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-600">Função</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded border"
              >
                <option value="DIRECTOR">Diretor</option>
                <option value="MANAGER">Manager</option>
                <option value="BROKER">Corretor</option>
                <option value="DATA_ENTRY">Operador</option>
              </select>
              <p className="text-xs text-gray-500">
                (Owner global não é convidável por design.)
              </p>
            </div>

            {inviteMsg && <div className="text-sm text-gray-700">{inviteMsg}</div>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInviteOpen(false)}
                className="px-3 py-2 rounded border hover:bg-gray-50"
                disabled={inviteBusy}
              >
                Cancelar
              </button>
              <button
                onClick={sendInvite}
                className="px-3 py-2 rounded bg-black text-white"
                disabled={inviteBusy}
              >
                {inviteBusy ? "Enviando..." : "Enviar convite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
