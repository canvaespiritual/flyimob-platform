-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('IMOBILIARIA', 'CORRETOR_AUTONOMO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'BROKER', 'MANAGER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'IMOBILIARIA',
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Construtora" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Construtora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empreendimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "construtoraId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "precoMin" INTEGER,
    "precoMax" INTEGER,
    "status" TEXT,
    "entregaPrev" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empreendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpreendimentoFoto" (
    "id" TEXT NOT NULL,
    "empreendimentoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpreendimentoFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Construtora_tenantId_idx" ON "Construtora"("tenantId");

-- CreateIndex
CREATE INDEX "Empreendimento_tenantId_idx" ON "Empreendimento"("tenantId");

-- CreateIndex
CREATE INDEX "Empreendimento_lat_lng_idx" ON "Empreendimento"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "Empreendimento_tenantId_slug_key" ON "Empreendimento"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "EmpreendimentoFoto_empreendimentoId_idx" ON "EmpreendimentoFoto"("empreendimentoId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Construtora" ADD CONSTRAINT "Construtora_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empreendimento" ADD CONSTRAINT "Empreendimento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empreendimento" ADD CONSTRAINT "Empreendimento_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "Construtora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpreendimentoFoto" ADD CONSTRAINT "EmpreendimentoFoto_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
