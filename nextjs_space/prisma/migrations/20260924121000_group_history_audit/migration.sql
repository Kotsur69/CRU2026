-- Spec 21 — Grupy (docs/features/21-grupy.md).
--
-- Legacy `users_groups_history` is just `(user_id, group_id)`: 391 past memberships with
-- no date, no author and no reason. Membership changes made in this application record
-- all three. The columns are nullable and have NO default, so the imported rows keep
-- null — a default would stamp the migration or import time on them, which is exactly
-- the date legacy never had. Nothing is backfilled.

-- CreateEnum
CREATE TYPE "GroupMembershipAction" AS ENUM ('ADDED', 'REMOVED');

-- AlterTable
ALTER TABLE "UserGroupHistory" ADD COLUMN "action" "GroupMembershipAction",
ADD COLUMN "changedAt" TIMESTAMP(3),
ADD COLUMN "changedById" INTEGER;

-- CreateIndex
CREATE INDEX "UserGroupHistory_changedById_idx" ON "UserGroupHistory"("changedById");

-- AddForeignKey
ALTER TABLE "UserGroupHistory" ADD CONSTRAINT "UserGroupHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
