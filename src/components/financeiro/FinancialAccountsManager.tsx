"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AccountType = "CHECKING" | "TAX_RESERVE" | "CASH" | "OTHER";
type Account = {
  id: string;
  name: string;
  type: AccountType;
  bankName: string | null;
  agency: string | null;
  account: string | null;
  pixType: string | null;
  pixKey: string | null;
  notes: string | null;
  active: boolean;
};

const typeLabels: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  TAX_RESERVE: "Reserva de impostos",
  CASH: "Caixa",
  OTHER: "Outro",
};

const empty = {
  name: "",
  type: "CHECKING" as AccountType,
  bankName: "",
  agency: "",
  account: "",
  pixType: "",
  pixKey: "",
  notes: "",
  active: true,
};

export default function FinancialAccountsManager({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startNew() {
    setEditingId(null);
    setForm({ ...empty });
    setError("");
    setOpen(true);
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setForm({ name: account.name, type: account.type,
      bankName: account.bankName ?? "", agency: account.agency ?? "", account: account.account ?? "",
      pixType: account.pixType ?? "", pixKey: account.pixKey ?? "", notes: account.notes ?? "", active: account.active });
    setError("");
    setOpen(true);
  }

  async function send(method: "POST" | "PUT" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch("/api/financeiro/contas-financeiras", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a conta.");
    router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(editingId ? "PUT" : "POST", { ...form, ...(editingId ? { id: editingId } : {}) });
      setOpen(false);
      setEditingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar a conta."); }
    finally { setBusy(false); }
  }

  async function toggle(account: Account) {
    setBusy(true);
    setError("");
    try { await send("PATCH", { id: account.id, active: !account.active }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao alterar o status."); }
    finally { setBusy(false); }
  }

  const textField = (key: "name" | "bankName" | "agency" | "account" | "pixType" | "pixKey", label: string, required = false) => (
    <label className="text-sm font-medium">{label}
      <input className="mt-1 block w-full rounded border border-gray-300 p-2 font-normal" value={form[key]}
        required={required} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return <section className="space-y-5 rounded-lg border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Contas financeiras</h2><p className="text-sm text-gray-600">Contas inativas permanecem no histórico e deixam de aparecer nos novos lançamentos.</p></div>
      <button type="button" onClick={startNew} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">+ Nova conta</button>
    </div>

    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    {open && <form onSubmit={save} className="space-y-4 rounded border bg-gray-50 p-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{editingId ? "Editar conta" : "Nova conta"}</h3><button type="button" className="text-sm underline" onClick={() => { setOpen(false); setError(""); }}>Fechar</button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("name", "Nome", true)}
        <label className="text-sm font-medium">Tipo
          <select className="mt-1 block w-full rounded border border-gray-300 p-2 font-normal" value={form.type}
            onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AccountType }))}>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {textField("bankName", "Banco/instituição")}
        {textField("agency", "Agência")}
        {textField("account", "Conta")}
        {textField("pixType", "Tipo de chave PIX")}
        {textField("pixKey", "Chave PIX")}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Ativa</label>
      </div>
      <label className="block text-sm font-medium">Observações<textarea className="mt-1 block w-full rounded border border-gray-300 p-2 font-normal" maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      <button disabled={busy} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Salvando..." : "Salvar conta"}</button>
    </form>}

    {accounts.length === 0 ? <p className="rounded border p-4 text-sm text-gray-600">Nenhuma conta financeira cadastrada.</p> :
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-gray-600"><th className="p-2">Nome</th><th className="p-2">Banco</th><th className="p-2">Tipo</th><th className="p-2">Agência</th><th className="p-2">Conta</th><th className="p-2">PIX</th><th className="p-2">Status</th><th className="p-2">Ações</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-b align-top"><td className="p-2 font-medium">{account.name}</td><td className="p-2">{account.bankName || "—"}</td><td className="p-2">{typeLabels[account.type]}</td><td className="p-2">{account.agency || "—"}</td><td className="p-2">{account.account || "—"}</td><td className="p-2">{account.pixKey ? `${account.pixType ? `${account.pixType}: ` : ""}${account.pixKey}` : "—"}</td><td className="p-2">{account.active ? "Ativa" : "Inativa"}</td><td className="p-2 whitespace-nowrap"><button type="button" onClick={() => startEdit(account)} className="mr-3 underline">Editar</button><button type="button" disabled={busy} onClick={() => toggle(account)} className="underline disabled:opacity-50">{account.active ? "Desativar" : "Ativar"}</button></td></tr>)}</tbody></table></div>}
  </section>;
}
