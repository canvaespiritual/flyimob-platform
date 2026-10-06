import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authorize, MarketingError, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { documentationStorage, type DocumentationStorage } from "@/lib/documentacoes/storage.server";
import { fileMetadata, validateFile, readUpload } from "@/lib/documentacoes/file-policy";

export async function uploadMoneyReceipt(viewer: MarketingViewer,movementId:string,req:Request,db=prisma,storage:DocumentationStorage=documentationStorage) {
 authorize(viewer,true);const tenantId=viewer.tenant.id;
 const movement=await db.marketingMoneyMovement.findFirst({where:{tenantId,id:movementId},select:{id:true}});
 if(!movement)throw new MarketingError(404,"Movimento não encontrado.");
 let name:string;try{name=decodeURIComponent(req.headers.get("x-file-name")??"");}catch{throw new MarketingError(400,"Nome inválido.");}
 const meta=fileMetadata({originalFileName:name,mimeType:req.headers.get("content-type"),fileSize:Number(req.headers.get("x-file-size"))});
 const bytes=await readUpload(req,meta.fileSize),checksum=await validateFile(bytes,meta.mimeType,meta.fileSize);
 const id=req.headers.get("x-upload-id")??randomUUID();if(!/^[a-f0-9-]{36}$/.test(id))throw new MarketingError(400,"Identificador de upload inválido.");
 const existing=await db.marketingMoneyReceipt.findUnique({where:{id}});
 if(existing){if(existing.tenantId!==tenantId||existing.movementId!==movementId||existing.checksum!==checksum)throw new MarketingError(409,"Upload já utilizado.");return {id};}
 const document={id,tenantId,folderId:movementId,storageKey:`private/marketing/${tenantId}/${movementId}/${id}`,mimeType:meta.mimeType,fileSize:BigInt(meta.fileSize),uploadedById:viewer.user.id};
 try{await storage.put(document,bytes,checksum);}catch(error){
  if(!error||typeof error!=="object"||!("status" in error)||error.status!==409)throw error;
  const prior=await storage.get(document);if(prior.checksum!==checksum)throw new MarketingError(409,"Conteúdo de upload diferente.");
 }
 return marketingTransaction(db,async tx=>{
  const result=await tx.marketingMoneyReceipt.create({data:{id,tenantId,movementId,storageKey:document.storageKey,originalName:meta.originalFileName,mimeType:meta.mimeType,fileSize:document.fileSize,checksum,uploadedById:viewer.user.id},select:{id:true}});
  await audit(tx,viewer,"MARKETING_RECEIPT_ATTACHED",movementId,{after:{receiptId:id,checksum}});return result;
 });
}
export async function downloadMoneyReceipt(viewer:MarketingViewer,id:string,db=prisma,storage:DocumentationStorage=documentationStorage){
 authorize(viewer);const receipt=await db.marketingMoneyReceipt.findFirst({where:{id,tenantId:viewer.tenant.id}});
 if(!receipt)throw new MarketingError(404,"Comprovante não encontrado.");
 const result=await storage.get({...receipt,folderId:receipt.movementId});
 if(result.checksum!==receipt.checksum)throw new MarketingError(409,"Comprovante divergente.");
 return {receipt,bytes:result.bytes};
}
