-- CreateEnum
CREATE TYPE "DocumentationFolderStatus" AS ENUM ('EM_MONTAGEM', 'AGUARDANDO_DOCUMENTOS', 'PRONTA_PARA_ANALISE', 'AGUARDANDO_CORRESPONDENTE', 'PENDENCIA_DOCUMENTAL', 'EM_REANALISE', 'APROVADO', 'CONDICIONADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "DocumentationPersonRelationship" AS ENUM ('TITULAR', 'CONJUGE', 'DEVEDOR_SOLIDARIO', 'FIADOR', 'FILHO', 'PARENTE', 'PROCURADOR', 'TERCEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentationDocumentStatus" AS ENUM ('PROCESSING', 'ACTIVE', 'INVALIDATED', 'REPLACED');

-- CreateEnum
CREATE TYPE "DocumentationUploadOrigin" AS ENUM ('ADMINISTRATION', 'CORRESPONDENT');

-- CreateEnum
CREATE TYPE "DocumentationAnalysisResult" AS ENUM ('PENDENCIA_DOCUMENTAL', 'APROVADO', 'CONDICIONADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "DocumentationPendingStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentationCommentVisibility" AS ENUM ('INTERNAL', 'SHARED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CORRESPONDENTE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DocumentationFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "crmLeadId" TEXT,
    "brokerId" TEXT NOT NULL,
    "correspondentId" TEXT,
    "construtoraId" TEXT,
    "empreendimentoId" TEXT,
    "status" "DocumentationFolderStatus" NOT NULL DEFAULT 'EM_MONTAGEM',
    "administrativeObservation" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationPerson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthDate" TIMESTAMP(3),
    "relationship" "DocumentationPersonRelationship" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationDocumentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationDocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "personId" TEXT,
    "documentTypeId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadOrigin" "DocumentationUploadOrigin" NOT NULL,
    "uploadedByRole" "UserRole" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" TEXT,
    "status" "DocumentationDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "replacedDocumentId" TEXT,
    "replacementReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationAnalysisRound" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "correspondentId" TEXT NOT NULL,
    "folderVersion" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentationAnalysisRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationRoundDocument" (
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "DocumentationRoundDocument_pkey" PRIMARY KEY ("tenantId","folderId","roundId","documentId")
);

-- CreateTable
CREATE TABLE "DocumentationAnalysis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "result" "DocumentationAnalysisResult" NOT NULL,
    "observation" TEXT,
    "requestedAmount" DECIMAL(18,2),
    "approvedAmount" DECIMAL(18,2),
    "financingAmount" DECIMAL(18,2),
    "subsidyAmount" DECIMAL(18,2),
    "fgtsAmount" DECIMAL(18,2),
    "entryAmount" DECIMAL(18,2),
    "metadata" JSONB,
    "metadataVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationAnalysisDocument" (
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "DocumentationAnalysisDocument_pkey" PRIMARY KEY ("tenantId","folderId","analysisId","documentId")
);

-- CreateTable
CREATE TABLE "DocumentationPendingItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "roundId" TEXT,
    "analysisId" TEXT,
    "personId" TEXT,
    "documentTypeId" TEXT,
    "documentId" TEXT,
    "message" TEXT NOT NULL,
    "status" "DocumentationPendingStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentationPendingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "visibility" "DocumentationCommentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "UserRole",
    "eventType" VARCHAR(100) NOT NULL,
    "roundId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_status_createdAt_idx" ON "DocumentationFolder"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_brokerId_idx" ON "DocumentationFolder"("tenantId", "brokerId");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_correspondentId_status_idx" ON "DocumentationFolder"("tenantId", "correspondentId", "status");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_crmLeadId_idx" ON "DocumentationFolder"("tenantId", "crmLeadId");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_createdById_idx" ON "DocumentationFolder"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_construtoraId_idx" ON "DocumentationFolder"("tenantId", "construtoraId");

-- CreateIndex
CREATE INDEX "DocumentationFolder_tenantId_empreendimentoId_idx" ON "DocumentationFolder"("tenantId", "empreendimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationFolder_tenantId_id_key" ON "DocumentationFolder"("tenantId", "id");

-- CreateIndex
CREATE INDEX "DocumentationPerson_tenantId_folderId_relationship_idx" ON "DocumentationPerson"("tenantId", "folderId", "relationship");

-- CreateIndex
CREATE INDEX "DocumentationPerson_tenantId_cpf_idx" ON "DocumentationPerson"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationPerson_tenantId_folderId_id_key" ON "DocumentationPerson"("tenantId", "folderId", "id");

-- CreateIndex
CREATE INDEX "DocumentationDocumentType_tenantId_isActive_sortOrder_idx" ON "DocumentationDocumentType"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationDocumentType_tenantId_id_key" ON "DocumentationDocumentType"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationDocumentType_tenantId_code_key" ON "DocumentationDocumentType"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationDocument_storageKey_key" ON "DocumentationDocument"("storageKey");

-- CreateIndex
CREATE INDEX "DocumentationDocument_tenantId_folderId_status_idx" ON "DocumentationDocument"("tenantId", "folderId", "status");

-- CreateIndex
CREATE INDEX "DocumentationDocument_tenantId_folderId_personId_idx" ON "DocumentationDocument"("tenantId", "folderId", "personId");

-- CreateIndex
CREATE INDEX "DocumentationDocument_tenantId_documentTypeId_idx" ON "DocumentationDocument"("tenantId", "documentTypeId");

-- CreateIndex
CREATE INDEX "DocumentationDocument_tenantId_uploadedById_idx" ON "DocumentationDocument"("tenantId", "uploadedById");

-- CreateIndex
CREATE INDEX "DocumentationDocument_tenantId_folderId_replacedDocumentId_idx" ON "DocumentationDocument"("tenantId", "folderId", "replacedDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationDocument_tenantId_folderId_id_key" ON "DocumentationDocument"("tenantId", "folderId", "id");

-- CreateIndex
CREATE INDEX "DocumentationAnalysisRound_tenantId_correspondentId_sentAt_idx" ON "DocumentationAnalysisRound"("tenantId", "correspondentId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationAnalysisRound_tenantId_folderId_id_key" ON "DocumentationAnalysisRound"("tenantId", "folderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationAnalysisRound_tenantId_folderId_sequence_key" ON "DocumentationAnalysisRound"("tenantId", "folderId", "sequence");

-- CreateIndex
CREATE INDEX "DocumentationRoundDocument_tenantId_folderId_documentId_idx" ON "DocumentationRoundDocument"("tenantId", "folderId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentationAnalysis_tenantId_result_createdAt_idx" ON "DocumentationAnalysis"("tenantId", "result", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentationAnalysis_tenantId_authorId_idx" ON "DocumentationAnalysis"("tenantId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationAnalysis_tenantId_folderId_id_key" ON "DocumentationAnalysis"("tenantId", "folderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationAnalysis_tenantId_folderId_roundId_key" ON "DocumentationAnalysis"("tenantId", "folderId", "roundId");

-- CreateIndex
CREATE INDEX "DocumentationAnalysisDocument_tenantId_folderId_documentId_idx" ON "DocumentationAnalysisDocument"("tenantId", "folderId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_folderId_status_idx" ON "DocumentationPendingItem"("tenantId", "folderId", "status");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_folderId_roundId_idx" ON "DocumentationPendingItem"("tenantId", "folderId", "roundId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_folderId_analysisId_idx" ON "DocumentationPendingItem"("tenantId", "folderId", "analysisId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_folderId_personId_idx" ON "DocumentationPendingItem"("tenantId", "folderId", "personId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_documentTypeId_idx" ON "DocumentationPendingItem"("tenantId", "documentTypeId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_folderId_documentId_idx" ON "DocumentationPendingItem"("tenantId", "folderId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_createdById_idx" ON "DocumentationPendingItem"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "DocumentationPendingItem_tenantId_resolvedById_idx" ON "DocumentationPendingItem"("tenantId", "resolvedById");

-- CreateIndex
CREATE INDEX "DocumentationComment_tenantId_folderId_visibility_createdAt_idx" ON "DocumentationComment"("tenantId", "folderId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentationComment_tenantId_authorId_idx" ON "DocumentationComment"("tenantId", "authorId");

-- CreateIndex
CREATE INDEX "DocumentationEvent_tenantId_folderId_createdAt_idx" ON "DocumentationEvent"("tenantId", "folderId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentationEvent_tenantId_folderId_roundId_idx" ON "DocumentationEvent"("tenantId", "folderId", "roundId");

-- CreateIndex
CREATE INDEX "DocumentationEvent_tenantId_actorId_idx" ON "DocumentationEvent"("tenantId", "actorId");

-- CreateIndex
CREATE INDEX "DocumentationEvent_tenantId_eventType_createdAt_idx" ON "DocumentationEvent"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Construtora_tenantId_id_key" ON "Construtora"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Empreendimento_tenantId_id_key" ON "Empreendimento"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CRMLead_tenantId_id_key" ON "CRMLead"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_crmLeadId_fkey" FOREIGN KEY ("tenantId", "crmLeadId") REFERENCES "CRMLead"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_brokerId_fkey" FOREIGN KEY ("tenantId", "brokerId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_correspondentId_fkey" FOREIGN KEY ("tenantId", "correspondentId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_construtoraId_fkey" FOREIGN KEY ("tenantId", "construtoraId") REFERENCES "Construtora"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_empreendimentoId_fkey" FOREIGN KEY ("tenantId", "empreendimentoId") REFERENCES "Empreendimento"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPerson" ADD CONSTRAINT "DocumentationPerson_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocumentType" ADD CONSTRAINT "DocumentationDocumentType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_tenantId_folderId_personId_fkey" FOREIGN KEY ("tenantId", "folderId", "personId") REFERENCES "DocumentationPerson"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_tenantId_documentTypeId_fkey" FOREIGN KEY ("tenantId", "documentTypeId") REFERENCES "DocumentationDocumentType"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_tenantId_uploadedById_fkey" FOREIGN KEY ("tenantId", "uploadedById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_tenantId_folderId_replacedDocumentId_fkey" FOREIGN KEY ("tenantId", "folderId", "replacedDocumentId") REFERENCES "DocumentationDocument"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysisRound" ADD CONSTRAINT "DocumentationAnalysisRound_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysisRound" ADD CONSTRAINT "DocumentationAnalysisRound_tenantId_correspondentId_fkey" FOREIGN KEY ("tenantId", "correspondentId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationRoundDocument" ADD CONSTRAINT "DocumentationRoundDocument_tenantId_folderId_roundId_fkey" FOREIGN KEY ("tenantId", "folderId", "roundId") REFERENCES "DocumentationAnalysisRound"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationRoundDocument" ADD CONSTRAINT "DocumentationRoundDocument_tenantId_folderId_documentId_fkey" FOREIGN KEY ("tenantId", "folderId", "documentId") REFERENCES "DocumentationDocument"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysis" ADD CONSTRAINT "DocumentationAnalysis_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysis" ADD CONSTRAINT "DocumentationAnalysis_tenantId_folderId_roundId_fkey" FOREIGN KEY ("tenantId", "folderId", "roundId") REFERENCES "DocumentationAnalysisRound"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysis" ADD CONSTRAINT "DocumentationAnalysis_tenantId_authorId_fkey" FOREIGN KEY ("tenantId", "authorId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysisDocument" ADD CONSTRAINT "DocumentationAnalysisDocument_tenantId_folderId_analysisId_fkey" FOREIGN KEY ("tenantId", "folderId", "analysisId") REFERENCES "DocumentationAnalysis"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationAnalysisDocument" ADD CONSTRAINT "DocumentationAnalysisDocument_tenantId_folderId_documentId_fkey" FOREIGN KEY ("tenantId", "folderId", "documentId") REFERENCES "DocumentationDocument"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_folderId_roundId_fkey" FOREIGN KEY ("tenantId", "folderId", "roundId") REFERENCES "DocumentationAnalysisRound"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_folderId_analysisId_fkey" FOREIGN KEY ("tenantId", "folderId", "analysisId") REFERENCES "DocumentationAnalysis"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_folderId_personId_fkey" FOREIGN KEY ("tenantId", "folderId", "personId") REFERENCES "DocumentationPerson"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_documentTypeId_fkey" FOREIGN KEY ("tenantId", "documentTypeId") REFERENCES "DocumentationDocumentType"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_folderId_documentId_fkey" FOREIGN KEY ("tenantId", "folderId", "documentId") REFERENCES "DocumentationDocument"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationPendingItem" ADD CONSTRAINT "DocumentationPendingItem_tenantId_resolvedById_fkey" FOREIGN KEY ("tenantId", "resolvedById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationComment" ADD CONSTRAINT "DocumentationComment_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationComment" ADD CONSTRAINT "DocumentationComment_tenantId_authorId_fkey" FOREIGN KEY ("tenantId", "authorId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationEvent" ADD CONSTRAINT "DocumentationEvent_tenantId_folderId_fkey" FOREIGN KEY ("tenantId", "folderId") REFERENCES "DocumentationFolder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationEvent" ADD CONSTRAINT "DocumentationEvent_tenantId_actorId_fkey" FOREIGN KEY ("tenantId", "actorId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationEvent" ADD CONSTRAINT "DocumentationEvent_tenantId_folderId_roundId_fkey" FOREIGN KEY ("tenantId", "folderId", "roundId") REFERENCES "DocumentationAnalysisRound"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants on NEW tables only; no existing data is transformed.
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_version_check" CHECK ("version" >= 0);
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_fileSize_check" CHECK ("fileSize" >= 0);
ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_replacement_check" CHECK ("replacedDocumentId" IS NULL OR "replacedDocumentId" <> "id");
ALTER TABLE "DocumentationAnalysisRound" ADD CONSTRAINT "DocumentationAnalysisRound_sequence_check" CHECK ("sequence" > 0 AND "folderVersion" >= 0);
ALTER TABLE "DocumentationAnalysis" ADD CONSTRAINT "DocumentationAnalysis_metadataVersion_check" CHECK ("metadataVersion" > 0);

-- One titular per folder; other relationships can occur multiple times.
CREATE UNIQUE INDEX "DocumentationPerson_one_titular_per_folder" ON "DocumentationPerson"("tenantId", "folderId") WHERE "relationship" = 'TITULAR';

-- Append-only timeline. A future retention process must explicitly account for this.
CREATE FUNCTION documentation_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'DocumentationEvent is append-only' USING ERRCODE = '23000';
END;
$function$;
CREATE TRIGGER "DocumentationEvent_immutable" BEFORE UPDATE OR DELETE ON "DocumentationEvent"
FOR EACH ROW EXECUTE FUNCTION documentation_event_immutable();
