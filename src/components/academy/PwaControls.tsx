"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const subscribeSupport = () => () => {};
const pushSupport = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration() {
  return navigator.serviceWorker.register("/academy-admin-sw.js", { scope: "/academy-admin", updateViaCache: "none" });
}

async function persist(subscription: PushSubscription, method = "POST") {
  const response = await fetch("/api/admin/academy/push/subscription", {
    method, headers: { "Content-Type": "application/json" },
    body: JSON.stringify(method === "DELETE" ? { endpoint: subscription.endpoint } : subscription.toJSON()),
  });
  if (!response.ok) throw new Error(response.status === 503 ? "Push ainda não configurado no servidor." : "Não foi possível salvar as notificações. Confira seu acesso e tente novamente.");
}

export default function PwaControls() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("No iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Depois abra o app para ativar notificações.");
  const supported = useSyncExternalStore(subscribeSupport, pushSupport, () => false);

  useEffect(() => {
    const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onInstall);
    if ("serviceWorker" in navigator) {
      void registration().then(async (reg) => {
        if (!canPush) return;
        const subscription = await reg.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") {
          await persist(subscription);
          setActive(true);
        }
      }).catch(() => setMessage("Não foi possível inicializar as notificações. Tente ativá-las novamente."));
    }
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      const key = process.env.NEXT_PUBLIC_ACADEMY_VAPID_PUBLIC_KEY;
      if (!key && !active) throw new Error("A chave pública VAPID ainda não está configurada.");
      // Must happen synchronously from a user gesture on iOS.
      const permission = active ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permissão não concedida. Libere notificações nas configurações do navegador/app.");
      await registration();
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();
      if (active && subscription) {
        await persist(subscription, "DELETE");
        await subscription.unsubscribe();
        setActive(false);
        setMessage("Notificações desativadas neste dispositivo.");
      } else {
        if (!subscription) {
          const bytes = Uint8Array.from(atob(key!.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
          subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        await persist(subscription);
        setActive(true);
        setMessage("Notificações ativadas neste dispositivo. Você receberá novos checkouts e vendas confirmadas.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao configurar notificações."); }
    finally { setBusy(false); }
  }

  async function testPush(kind: "checkout" | "sale") {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) throw new Error("Ative as notificações primeiro.");
      const response = await fetch("/api/admin/academy/push/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, kind }),
      });
      if (!response.ok) throw new Error("O envio de teste falhou. Verifique a configuração VAPID e sua subscription.");
      setMessage("Teste aceito pelo serviço push. Confira a notificação neste dispositivo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no teste."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-semibold">Academy no seu celular</h2>
      <div className="my-3 flex flex-wrap gap-2">
        {install && <button className="rounded-lg bg-slate-700 px-4 py-3 text-sm" onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null); }}>Instalar aplicativo</button>}
        <button disabled={!supported || busy} onClick={() => void toggle()} className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Aguarde…" : active ? "Desativar notificações" : "Ativar notificações"}
        </button>
        {active && <>
          <button disabled={busy} onClick={() => void testPush("checkout")} className="rounded-lg border border-slate-600 px-3 py-3 text-xs">Testar checkout</button>
          <button disabled={busy} onClick={() => void testPush("sale")} className="rounded-lg border border-slate-600 px-3 py-3 text-xs">Testar venda</button>
        </>}
      </div>
      <p role="status" className="text-xs leading-5 text-slate-400">{message}</p>
      <p className="mt-2 text-xs text-slate-500">Os alertas podem mostrar nome e valor na tela bloqueada. Nenhum dado comercial fica disponível offline.</p>
    </section>
  );
}
