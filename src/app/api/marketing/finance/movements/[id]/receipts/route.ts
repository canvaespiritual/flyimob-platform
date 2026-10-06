import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { uploadMoneyReceipt } from "@/lib/marketing/finance-receipts.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
export const maxDuration=120;
export async function POST(req:Request,context:{params:Promise<{id:string}>}){try{const viewer=await marketingSession(true);sameOrigin(req);return json(await uploadMoneyReceipt(viewer,(await context.params).id,req),201);}catch(e){return failure(e);}}
