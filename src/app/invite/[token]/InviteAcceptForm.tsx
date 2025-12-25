"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InviteData = {
  email: string;
  role: string;
  tenantId: string | null;
  tenantType: string | null;
  expiresAt: string;
};

export default function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && password.length >= 8 && !!invite && !loading;
  }, [name, password, invite, loading]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/invites/${token}`, { cache: "no-store" });
        const data = await res.json();

        if (!alive) return;

        if (!res.ok) {
          setInvite(null);
          setError(data?.error || "Convite inválido.");
          return;
        }

        setInvite(data.invite);
      } catch (e) {
        if (!alive) return;
        setError("Falha ao carregar o convite.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);

    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data?.error || "Não foi possível ativar.");
      return;
    }

    router.replace("/admin/dashboard");

  }

  if (loading) {
    return <p className="text-sm text-gray-600">Carregando convite…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Não foi possível usar este convite</p>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
        <a className="text-sm underline mt-3 inline-block" href="/login">
          Ir para o login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <div>
          <span className="text-gray-600">Email:</span>{" "}
          <span className="font-medium">{invite?.email}</span>
        </div>
        <div className="mt-1">
          <span className="text-gray-600">Função:</span>{" "}
          <span className="font-medium">{invite?.role}</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Nome</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          autoComplete="name"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Senha (mín. 8)</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Crie uma senha"
          autoComplete="new-password"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
        disabled={!canSubmit}
        type="submit"
      >
        Ativar acesso
      </button>
    </form>
  );
}
