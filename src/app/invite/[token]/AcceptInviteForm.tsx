"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!password || password.length < 8) return setErr("Use uma senha com pelo menos 8 caracteres.");
    if (password !== password2) return setErr("As senhas não conferem.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao aceitar convite.");

      router.replace("/admin/dashboard");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="text-sm text-gray-700">Senha</label>
        <input
          className="mt-1 w-full border rounded px-3 py-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="text-sm text-gray-700">Confirmar senha</label>
        <input
          className="mt-1 w-full border rounded px-3 py-2"
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-60"
      >
        {loading ? "Ativando..." : "Ativar acesso"}
      </button>
    </form>
  );
}
