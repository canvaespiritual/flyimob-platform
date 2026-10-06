import { marketingSession,failure } from "@/lib/marketing/http.server";
import { downloadMoneyReceipt } from "@/lib/marketing/finance-receipts.server";
import { disposition } from "@/lib/documentacoes/file-policy";
export async function GET(req:Request,context:{params:Promise<{id:string}>}){try{const {receipt,bytes}=await downloadMoneyReceipt(await marketingSession(),(await context.params).id);return new Response(Buffer.from(bytes),{headers:{"Content-Type":receipt.mimeType,"Content-Disposition":disposition(receipt.originalName,true),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});}catch(e){return failure(e);}}
