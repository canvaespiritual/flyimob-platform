import { NextResponse } from "next/server";
import { ComparativoError } from "./plano";
import { DocumentationError } from "../documentacoes/validation";

export function sameOrigin(req: Request) {
  const reject = () => { throw new ComparativoError(403, "Origem do pedido inválida."); };
  if (req.headers.get("sec-fetch-site") === "cross-site") reject();
  const origin = req.headers.get("origin");
  if (!origin) return;
  // Railway terminates HTTPS before Next. Its internal request URL is not
  // the browser's origin. Only trust our configured public URL, not forwarded headers.
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let publicOrigin: string;
  try { publicOrigin = new URL(configured || req.url).origin; } catch { return reject(); }
  const allowed = new Set([publicOrigin]);
  if (["https://flyimob.com", "https://www.flyimob.com"].includes(publicOrigin)) {
    allowed.add("https://flyimob.com"); allowed.add("https://www.flyimob.com");
  }
  if (!allowed.has(origin)) reject();
}
export function failure(e: unknown) {
  if (e instanceof ComparativoError || e instanceof DocumentationError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  // Do not log private documents, financial data or API responses.
  console.error("comparativo operation failed", e instanceof Error ? e.name : "unknown");
  return NextResponse.json({ ok: false, error: "Não foi possível concluir. Atualize a página e tente novamente." }, { status: 500 });
}
export function serializeAdmin<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === "bigint" ? Number(v) : v));
}
export function isPublished(c: { modoDirecionamento: boolean; publicadoEm: unknown }) { return !c.modoDirecionamento || !!c.publicadoEm; }
type Attachment = { id: string; titulo: string; nomeOriginal: string; itemId?: string | null };
type PrivateItem = { anexos?: Attachment[]; planoRascunho?: unknown; extracaoOriginal?: unknown; extracaoToken?: unknown; extracaoIniciadaEm?: unknown; estadoExtracao?: unknown; revisao?: number };
function omit<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const result = { ...value }; for (const key of keys) delete result[key]; return result;
}
export function publicComparativo<T extends { revisao?: number; anexos?: Attachment[]; items: PrivateItem[] }>(c: T) {
  const publicData = omit(c, ["revisao"]);
  const attachment = (a: Attachment) => ({ id: a.id, titulo: a.titulo, nomeOriginal: a.nomeOriginal });
  return { ...publicData, anexos: (c.anexos ?? []).filter(a => !a.itemId).map(attachment),
    items: c.items.map((item: T["items"][number]) => {
      const safe = omit(item, ["planoRascunho", "extracaoOriginal", "extracaoToken", "extracaoIniciadaEm", "estadoExtracao", "revisao"]);
      return { ...safe, anexos: (item.anexos ?? []).map(attachment) };
    }),
  };
}
