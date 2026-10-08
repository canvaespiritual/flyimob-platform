import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { createGlobalContribution } from "@/lib/marketing/finance.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
export async function POST(req:Request){try{const viewer=await marketingSession(true);sameOrigin(req);return json(await createGlobalContribution(viewer,await req.json()),201);}catch(e){return failure(e);}}
