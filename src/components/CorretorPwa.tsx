"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export default function CorretorPwa() {
  const [offline, setOffline] = useState(false), [install, setInstall] = useState<InstallEvent | null>(null), [waiting, setWaiting] = useState<ServiceWorker | null>(null), [failure, setFailure] = useState(false);
  useEffect(() => {
    let active = true, registration: ServiceWorkerRegistration | undefined;
    const network = () => setOffline(!navigator.onLine), prompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    const installed = () => setInstall(null);
    network(); window.addEventListener("online", network); window.addEventListener("offline", network); window.addEventListener("beforeinstallprompt", prompt); window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/corretor-sw.js", { scope: "/", updateViaCache: "none" }).then(r => {
      if (!active) return; registration = r; if (r.waiting) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => { const worker = r.installing; worker?.addEventListener("statechange", () => { if (active && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker); }); });
    }).catch(() => { if (active) setFailure(true); });
    const check = () => { if (document.visibilityState === "visible") void registration?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.removeEventListener("online", network); window.removeEventListener("offline", network); window.removeEventListener("beforeinstallprompt", prompt); window.removeEventListener("appinstalled", installed); document.removeEventListener("visibilitychange", check); };
  }, []);
  return <div className="space-y-2 text-sm" aria-live="polite">
    {offline && <p role="alert" className="bg-orange-50 border rounded p-3">Sem conexão. Não envie formulários até reconectar. O progresso do vídeo depende da confirmação do servidor.</p>}
    {failure && <p className="border rounded p-3">Não foi possível preparar a instalação do aplicativo. Tente reabrir esta página.</p>}
    <div className="flex flex-wrap gap-2 items-center">{install ? <button className="border rounded p-3" onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null); }}>Instalar Flyimob</button> : <details><summary className="cursor-pointer py-3">Como instalar o aplicativo</summary><p>Android: menu do navegador → Instalar aplicativo. iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</p></details>}
      {waiting && <button className="border rounded p-3" onClick={() => { if (!window.confirm("Salve os formulários abertos antes de atualizar. Recarregar agora?")) return; navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); waiting.postMessage({ type: "SKIP_WAITING" }); }}>Atualização disponível · Recarregar</button>}
    </div>
  </div>;
}
