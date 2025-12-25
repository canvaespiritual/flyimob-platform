-- AlterTable
ALTER TABLE "UserInviteToken" ADD COLUMN     "invitedById" TEXT;

-- CreateIndex
CREATE INDEX "UserInviteToken_invitedById_idx" ON "UserInviteToken"("invitedById");

-- AddForeignKey
ALTER TABLE "UserInviteToken" ADD CONSTRAINT "UserInviteToken_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
