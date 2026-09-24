-- Spec 16 — when an opinion was requested. Legacy has no such column: the column is added
-- WITHOUT a default first, so every existing (imported) row keeps NULL, and only then gets
-- its default for rows created from now on.
ALTER TABLE "Opinion" ADD COLUMN "requestedAt" TIMESTAMP(3);
ALTER TABLE "Opinion" ALTER COLUMN "requestedAt" SET DEFAULT CURRENT_TIMESTAMP;
