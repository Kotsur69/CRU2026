-- Spec 01 — data-model gaps (docs/features/01-data-model-gaps.md).
--
-- Hand-written rather than generated: Prisma would drop and re-add the renamed columns,
-- losing Opinion.signedAt and the Contractor author ids. Renames keep the data. What the
-- first import collapsed is backfilled from what the rows still carry, and a re-run of
-- `yarn db:import` restores the rest from the dump (its "restore pass" fills only the
-- columns this migration cannot, and never overwrites a value the application wrote).

-- CreateEnum
CREATE TYPE "ContractModule" AS ENUM ('CONTRACT', 'PROJECT', 'RISK', 'LEGACY_2021');

-- Contract.module replaces isProject. The status's kind is exact for every record that
-- has a status. A record without one falls back to the collapsed boolean; the import's
-- restore pass then reads the real legacy value (1, 2 or 3) from the dump.
ALTER TABLE "Contract" ADD COLUMN "module" "ContractModule" NOT NULL DEFAULT 'CONTRACT';
UPDATE "Contract" AS c SET "module" = s."kind"::text::"ContractModule"
FROM "ContractStatus" AS s
WHERE s."id" = c."statusId";
UPDATE "Contract" SET "module" = 'PROJECT' WHERE "statusId" IS NULL AND "isProject";
ALTER TABLE "Contract" DROP COLUMN "isProject";
CREATE INDEX "Contract_module_idx" ON "Contract"("module");

-- Contract.opinionsRequestedById: legacy `giveopinions` is a user id, not a flag. The
-- boolean cannot say whose it was, so existing rows are filled by the restore pass.
ALTER TABLE "Contract" ADD COLUMN "opinionsRequestedById" INTEGER;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_opinionsRequestedById_fkey" FOREIGN KEY ("opinionsRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Opinion.signedAt held legacy `sign_date`, which is when the opinion was answered.
ALTER TABLE "Opinion" RENAME COLUMN "signedAt" TO "respondedAt";

-- Contractor provenance: `cru_id` restored, the author columns become relations.
ALTER TABLE "Contractor" ADD COLUMN "legacyCruId" INTEGER;
ALTER TABLE "Contractor" RENAME COLUMN "registeredByLegacyId" TO "registeredById";
ALTER TABLE "Contractor" RENAME COLUMN "modifiedByLegacyId" TO "modifiedById";
-- Legacy had no constraint here. The import notes every positive author id as a user, so
-- only "none" values (0) fail to resolve; they are nulled, as on the Contract columns.
UPDATE "Contractor" AS c SET "registeredById" = NULL
WHERE c."registeredById" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" AS u WHERE u."id" = c."registeredById");
UPDATE "Contractor" AS c SET "modifiedById" = NULL
WHERE c."modifiedById" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" AS u WHERE u."id" = c."modifiedById");
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Attachment.addedAtEstimated: legacy `attachment` has no timestamp column, so every
-- imported row carries the import date. Marked by the restore pass, which knows the
-- legacy ids; files uploaded in this application keep false.
ALTER TABLE "Attachment" ADD COLUMN "addedAtEstimated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: legacy `access`, the access-control metamodel (filled by the import).
CREATE TABLE "AccessDefinition" (
    "id" INTEGER NOT NULL,
    "dimension" "AccessDimension" NOT NULL,
    "dictionaryTable" TEXT NOT NULL,
    "labelColumn" TEXT NOT NULL,
    "contractColumn" TEXT NOT NULL,
    "joinTable" TEXT,

    CONSTRAINT "AccessDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessDefinition_dimension_key" ON "AccessDefinition"("dimension");

-- Cascade -> Restrict, matching legacy NO ACTION. Deletion is soft (Contract.isDeleted);
-- an accidental hard delete must fail loudly instead of destroying files and opinions.
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_contractId_fkey";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Opinion" DROP CONSTRAINT "Opinion_contractId_fkey";
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcceptanceForm" DROP CONSTRAINT "AcceptanceForm_contractId_fkey";
ALTER TABLE "AcceptanceForm" ADD CONSTRAINT "AcceptanceForm_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
