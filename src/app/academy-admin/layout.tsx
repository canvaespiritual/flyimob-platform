import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session.server";
import { isAcademyAdmin } from "@/lib/academy/push-policy";
import AcademyShell from "./AcademyShell";

export const metadata: Metadata = {
  title: "Corretor Academy — Administração",
  manifest: "/academy-admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Academy", statusBarStyle: "black-translucent" },
  icons: { apple: "/academy-admin/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#020617" };

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login?returnTo=%2Facademy-admin");
  if (!isAcademyAdmin(session.user.id)) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <h1 className="text-2xl font-semibold">Acesso restrito ao Academy</h1>
        <p className="mt-3">Solicite autorização para seu usuário.</p>
        <p className="mt-4 text-slate-300">
          Conectado como {session.user.name} ({session.user.email})
        </p>
        <form action="/api/auth/academy-logout" method="post" className="mt-6">
          <button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600">
            Sair / Trocar usuário
          </button>
        </form>
      </main>
    );
  }
  return <AcademyShell>{children}</AcademyShell>;
}
