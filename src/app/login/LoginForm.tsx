"use client";

import { useState } from "react";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Falha no login.");
        setLoading(false);
        return;
      }

      window.location.href = returnTo || "/admin/construtoras";
    } catch (err) {
      setError("Erro de rede ao fazer login.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md border rounded-xl p-6 bg-white">
      <h1 className="text-xl font-semibold mb-4">Entrar</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-gray-600">E-mail</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600">Senha</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="********"
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button
          disabled={loading}
          className="w-full border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
