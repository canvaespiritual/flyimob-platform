import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { syncSelectedBalances } from "@/lib/marketing/balances.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
export const maxDuration=300;
export async function POST(req:Request){try{const viewer=await marketingSession(true);sameOrigin(req);return json(await syncSelectedBalances(viewer));}catch(e){return failure(e);}}
