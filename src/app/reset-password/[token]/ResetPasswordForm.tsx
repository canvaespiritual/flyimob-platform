"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) return setErr("Senha mínima: 8 caracteres.");
    if (password !== password2) return setErr("As senhas não conferem.");

    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Falha ao redefinir senha.");
      setOk(true);

      // leva pro login
      router.replace("/login");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Definir nova senha</h1>

      {ok ? (
        <p className="text-sm">Senha atualizada. Redirecionando...</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Nova senha (mín. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Confirmar nova senha"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            type="password"
            required
          />
          {err && <p className="text-sm">{err}</p>}
          <button className="w-full rounded px-3 py-2 border" disabled={loading}>
            {loading ? "Salvando..." : "Atualizar senha"}
          </button>

          <Link className="underline text-sm" href="/login">
            Voltar ao login
          </Link>
        </form>
      )}
    </div>
  );
}
