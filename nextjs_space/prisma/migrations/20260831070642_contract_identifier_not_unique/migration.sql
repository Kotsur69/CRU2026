-- DropIndex
DROP INDEX "Contract_identifier_key";

-- CreateIndex
CREATE INDEX "Contract_identifier_idx" ON "Contract"("identifier");
