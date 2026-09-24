-- Spec 15 — when a notification was marked read. Legacy `shoutboxusers.readed` has no
-- timestamp, so the 13 933 historical read rows keep NULL here.
ALTER TABLE "ShoutboxRecipient" ADD COLUMN "readAt" TIMESTAMP(3);
