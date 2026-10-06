import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { marketingFinanceOptions } from "@/lib/marketing/finance-queries.server";
export async function GET(){try{return json(await marketingFinanceOptions(await marketingSession()));}catch(e){return failure(e);}}
