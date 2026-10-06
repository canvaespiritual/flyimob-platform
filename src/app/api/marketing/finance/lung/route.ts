import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { marketingLung } from "@/lib/marketing/finance-queries.server";
export async function GET(req:Request){try{return json(await marketingLung(await marketingSession(),new URL(req.url).searchParams));}catch(e){return failure(e);}}
