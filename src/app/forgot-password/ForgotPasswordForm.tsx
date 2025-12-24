"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Recuperar senha</h1>

      {sent ? (
        <div className="space-y-3">
          <p className="text-sm">
            Se esse e-mail existir e estiver ativo, você receberá um link para
            redefinir a senha.
          </p>
          <Link className="underline text-sm" href="/login">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <button
            className="w-full rounded px-3 py-2 border"
            disabled={loading}
            type="submit"
          >
            {loading ? "Enviando..." : "Enviar link de redefinição"}
          </button>

          <Link className="underline text-sm" href="/login">
            Voltar ao login
          </Link>
        </form>
      )}
    </div>
  );
}
