-- Spec 25 — Mailing (docs/features/25-mailing.md).
--
-- The approved match between a legacy mailing contact and a directory account. It starts
-- empty on every row and nothing in the application fills it yet: the matching script
-- only proposes pairs, and applying one waits for sign-off (Q67). Unique, because an
-- account takes one name and one address.

-- AlterTable
ALTER TABLE "MailingContact" ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "MailingContact_userId_key" ON "MailingContact"("userId");

-- AddForeignKey
ALTER TABLE "MailingContact" ADD CONSTRAINT "MailingContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
