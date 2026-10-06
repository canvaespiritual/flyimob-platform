import { marketingSession,json,failure } from "@/lib/marketing/http.server";
import { transitionMoneyMovement } from "@/lib/marketing/finance.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
export async function PATCH(req:Request,context:{params:Promise<{id:string}>}){try{const viewer=await marketingSession(true);sameOrigin(req);return json(await transitionMoneyMovement(viewer,(await context.params).id,await req.json()));}catch(e){return failure(e);}}

import { prisma } from "@/lib/prisma";
import { MarketingError } from "@/lib/marketing/policy";
export async function GET(req:Request,context:{params:Promise<{id:string}>}){try{const viewer=await marketingSession(),{id}=await context.params,tenantId=viewer.tenant.id;if(!await prisma.marketingMoneyMovement.findFirst({where:{tenantId,id},select:{id:true}}))throw new MarketingError(404,"Movimento não encontrado.");const events=await prisma.marketingAuditEvent.findMany({where:{tenantId,entityId:id,eventType:{in:["MARKETING_MONEY_CREATED","MARKETING_MONEY_STATUS_CHANGED","MARKETING_RECEIPT_ATTACHED"]}},select:{eventType:true,metadata:true,createdAt:true,actor:{select:{name:true}}},orderBy:{createdAt:"asc"}});return json({events});}catch(e){return failure(e);}}
