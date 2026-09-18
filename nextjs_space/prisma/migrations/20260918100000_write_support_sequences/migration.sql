-- Give the imported tables their own id sequences.
--
-- The legacy import supplies primary keys explicitly (they are the AMDS CRU ids, and the
-- whole import is idempotent because of it), so these tables were created without a
-- default. That makes every INSERT from the application itself fail. Each sequence is
-- therefore created and then restarted above the highest imported id, so application
-- records continue the legacy numbering instead of colliding with it.

CREATE SEQUENCE "Contractor_id_seq";
ALTER TABLE "Contractor" ALTER COLUMN "id" SET DEFAULT nextval('"Contractor_id_seq"');
ALTER SEQUENCE "Contractor_id_seq" OWNED BY "Contractor"."id";
SELECT setval('"Contractor_id_seq"', COALESCE((SELECT MAX("id") FROM "Contractor"), 0) + 1, false);

CREATE SEQUENCE "Contract_id_seq";
ALTER TABLE "Contract" ALTER COLUMN "id" SET DEFAULT nextval('"Contract_id_seq"');
ALTER SEQUENCE "Contract_id_seq" OWNED BY "Contract"."id";
SELECT setval('"Contract_id_seq"', COALESCE((SELECT MAX("id") FROM "Contract"), 0) + 1, false);

CREATE SEQUENCE "Attachment_id_seq";
ALTER TABLE "Attachment" ALTER COLUMN "id" SET DEFAULT nextval('"Attachment_id_seq"');
ALTER SEQUENCE "Attachment_id_seq" OWNED BY "Attachment"."id";
SELECT setval('"Attachment_id_seq"', COALESCE((SELECT MAX("id") FROM "Attachment"), 0) + 1, false);

CREATE SEQUENCE "Opinion_id_seq";
ALTER TABLE "Opinion" ALTER COLUMN "id" SET DEFAULT nextval('"Opinion_id_seq"');
ALTER SEQUENCE "Opinion_id_seq" OWNED BY "Opinion"."id";
SELECT setval('"Opinion_id_seq"', COALESCE((SELECT MAX("id") FROM "Opinion"), 0) + 1, false);

CREATE SEQUENCE "AcceptanceForm_id_seq";
ALTER TABLE "AcceptanceForm" ALTER COLUMN "id" SET DEFAULT nextval('"AcceptanceForm_id_seq"');
ALTER SEQUENCE "AcceptanceForm_id_seq" OWNED BY "AcceptanceForm"."id";
SELECT setval('"AcceptanceForm_id_seq"', COALESCE((SELECT MAX("id") FROM "AcceptanceForm"), 0) + 1, false);

CREATE SEQUENCE "Remark_id_seq";
ALTER TABLE "Remark" ALTER COLUMN "id" SET DEFAULT nextval('"Remark_id_seq"');
ALTER SEQUENCE "Remark_id_seq" OWNED BY "Remark"."id";
SELECT setval('"Remark_id_seq"', COALESCE((SELECT MAX("id") FROM "Remark"), 0) + 1, false);

CREATE SEQUENCE "Shoutbox_id_seq";
ALTER TABLE "Shoutbox" ALTER COLUMN "id" SET DEFAULT nextval('"Shoutbox_id_seq"');
ALTER SEQUENCE "Shoutbox_id_seq" OWNED BY "Shoutbox"."id";
SELECT setval('"Shoutbox_id_seq"', COALESCE((SELECT MAX("id") FROM "Shoutbox"), 0) + 1, false);

CREATE SEQUENCE "ShoutboxRecipient_id_seq";
ALTER TABLE "ShoutboxRecipient" ALTER COLUMN "id" SET DEFAULT nextval('"ShoutboxRecipient_id_seq"');
ALTER SEQUENCE "ShoutboxRecipient_id_seq" OWNED BY "ShoutboxRecipient"."id";
SELECT setval('"ShoutboxRecipient_id_seq"', COALESCE((SELECT MAX("id") FROM "ShoutboxRecipient"), 0) + 1, false);

CREATE SEQUENCE "ContractHistory_id_seq";
ALTER TABLE "ContractHistory" ALTER COLUMN "id" SET DEFAULT nextval('"ContractHistory_id_seq"');
ALTER SEQUENCE "ContractHistory_id_seq" OWNED BY "ContractHistory"."id";
SELECT setval('"ContractHistory_id_seq"', COALESCE((SELECT MAX("id") FROM "ContractHistory"), 0) + 1, false);
