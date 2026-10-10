import { marketingSession,json,failure } from '@/lib/marketing/http.server';
import { marketingPerformance } from '@/lib/marketing/performance.server';
export async function GET(req:Request){try{return json(await marketingPerformance(await marketingSession(),new URL(req.url).searchParams));}catch(error){return failure(error);}}
