import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { createMoneyMovement } from "@/lib/marketing/finance.server";
import { moneyMovementList } from "@/lib/marketing/finance-queries.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
export async function GET(req:Request){try{return json(await moneyMovementList(await marketingSession(),new URL(req.url).searchParams));}catch(e){return failure(e);}}
export async function POST(req:Request){try{const viewer=await marketingSession(true);sameOrigin(req);return json(await createMoneyMovement(viewer,await req.json()),201);}catch(e){return failure(e);}}
