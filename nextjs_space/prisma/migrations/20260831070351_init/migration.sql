-- CreateEnum
CREATE TYPE "ContractStatusKind" AS ENUM ('CONTRACT', 'PROJECT', 'RISK');

-- CreateEnum
CREATE TYPE "DomainKind" AS ENUM ('GENERAL', 'RISK');

-- CreateEnum
CREATE TYPE "AccessDimension" AS ENUM ('COMPANY', 'DOMAIN', 'LOCATION', 'NATURE', 'NOTICE_PERIOD', 'DOCUMENT_TYPE', 'TRADE', 'CONNECTED_ENTITY', 'PROJECT_MODULE', 'BUSINESSLINE');

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL,
    "login" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "passwordHash" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" INTEGER,
    "businesslineId" INTEGER,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "UserGroupHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "UserGroupHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLocation" (
    "userId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateTable
CREATE TABLE "UserAccessScope" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dimension" "AccessDimension" NOT NULL,
    "valueId" INTEGER NOT NULL,

    CONSTRAINT "UserAccessScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractStatus" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContractStatusKind" NOT NULL DEFAULT 'CONTRACT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Businessline" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Businessline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DomainKind" NOT NULL DEFAULT 'GENERAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractNature" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractNature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticePeriod" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NoticePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMethod" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliveryMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" INTEGER NOT NULL,
    "shortName" TEXT,
    "fullName" TEXT,
    "address" TEXT,
    "vatId" TEXT,
    "register" TEXT,
    "cruIdentifier" TEXT,
    "isCeidg" BOOLEAN NOT NULL DEFAULT false,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3),
    "registeredByLegacyId" INTEGER,
    "modifiedAt" TIMESTAMP(3),
    "modifiedByLegacyId" INTEGER,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" INTEGER NOT NULL,
    "identifier" TEXT,
    "parentId" INTEGER,
    "contractReference" TEXT,
    "description" TEXT,
    "remarks" TEXT,
    "documentTypeId" INTEGER,
    "statusId" INTEGER,
    "companyId" INTEGER,
    "businesslineId" INTEGER,
    "domainId" INTEGER,
    "natureId" INTEGER,
    "tradeId" INTEGER,
    "contractorId" INTEGER,
    "debtorId" INTEGER,
    "primaryLocationId" INTEGER,
    "dateBegin" DATE,
    "dateEnd" DATE,
    "sentOn" DATE,
    "salary" DECIMAL(14,2),
    "currencyId" INTEGER,
    "specificSalaryTerms" TEXT,
    "paymentTerm" TEXT,
    "noticePeriodId" INTEGER,
    "deliveryMethodId" INTEGER,
    "companiesConnected" BOOLEAN NOT NULL DEFAULT false,
    "insuranceGuarantee" BOOLEAN NOT NULL DEFAULT false,
    "obsc" BOOLEAN NOT NULL DEFAULT false,
    "obscDescription" TEXT,
    "opinionsRequested" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isProject" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "tempForm" BOOLEAN,
    "bill" BOOLEAN NOT NULL DEFAULT false,
    "spsId" INTEGER,
    "spsLastVersion" INTEGER,
    "isAccepted" BOOLEAN,
    "acceptedById" INTEGER,
    "acceptedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredById" INTEGER,
    "modifiedAt" TIMESTAMP(3),
    "modifiedById" INTEGER,
    "legacyRegisteredAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLocationLink" (
    "contractId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,

    CONSTRAINT "ContractLocationLink_pkey" PRIMARY KEY ("contractId","locationId")
);

-- CreateTable
CREATE TABLE "ContractUser" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContractUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "storageKey" TEXT,
    "fileType" TEXT,
    "version" INTEGER,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "formSession" TEXT,
    "contractId" INTEGER,
    "contractorId" INTEGER,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpinionType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER,

    CONSTRAINT "OpinionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opinion" (
    "id" INTEGER NOT NULL,
    "contractId" INTEGER NOT NULL,
    "opinionTypeId" INTEGER,
    "userId" INTEGER,
    "description" TEXT NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "noMdr" BOOLEAN NOT NULL DEFAULT false,
    "formVerified" BOOLEAN NOT NULL DEFAULT false,
    "sendVerified" BOOLEAN NOT NULL DEFAULT false,
    "sendInfo" BOOLEAN NOT NULL DEFAULT false,
    "mailingDisabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Opinion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceForm" (
    "id" INTEGER NOT NULL,
    "contractId" INTEGER NOT NULL,
    "mdrProcedure" BOOLEAN NOT NULL DEFAULT false,
    "initialVerification" BOOLEAN NOT NULL DEFAULT false,
    "formSent" BOOLEAN NOT NULL DEFAULT false,
    "ownerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "ownerAcceptedAt" TIMESTAMP(3),

    CONSTRAINT "AcceptanceForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remark" (
    "id" INTEGER NOT NULL,
    "contractId" INTEGER,
    "userId" INTEGER,
    "body" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shoutbox" (
    "id" INTEGER NOT NULL,
    "messageId" INTEGER,
    "contractId" INTEGER,
    "remarkId" INTEGER,

    CONSTRAINT "Shoutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoutboxRecipient" (
    "id" INTEGER NOT NULL,
    "shoutboxId" INTEGER NOT NULL,
    "userId" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShoutboxRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractHistory" (
    "id" INTEGER NOT NULL,
    "contractId" INTEGER,
    "columnName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingGroup" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MailingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingContact" (
    "id" INTEGER NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "mailingGroupId" INTEGER,

    CONSTRAINT "MailingContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE INDEX "Group_businesslineId_idx" ON "Group"("businesslineId");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE INDEX "UserGroupHistory_userId_idx" ON "UserGroupHistory"("userId");

-- CreateIndex
CREATE INDEX "UserGroupHistory_groupId_idx" ON "UserGroupHistory"("groupId");

-- CreateIndex
CREATE INDEX "UserLocation_locationId_idx" ON "UserLocation"("locationId");

-- CreateIndex
CREATE INDEX "UserAccessScope_userId_idx" ON "UserAccessScope"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccessScope_userId_dimension_valueId_key" ON "UserAccessScope"("userId", "dimension", "valueId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");

-- CreateIndex
CREATE INDEX "ContractStatus_kind_idx" ON "ContractStatus"("kind");

-- CreateIndex
CREATE INDEX "Domain_kind_idx" ON "Domain"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "NoticePeriod_name_key" ON "NoticePeriod"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE INDEX "Contractor_shortName_idx" ON "Contractor"("shortName");

-- CreateIndex
CREATE INDEX "Contractor_fullName_idx" ON "Contractor"("fullName");

-- CreateIndex
CREATE INDEX "Contractor_vatId_idx" ON "Contractor"("vatId");

-- CreateIndex
CREATE INDEX "Contractor_isDeleted_idx" ON "Contractor"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_identifier_key" ON "Contract"("identifier");

-- CreateIndex
CREATE INDEX "Contract_statusId_idx" ON "Contract"("statusId");

-- CreateIndex
CREATE INDEX "Contract_companyId_idx" ON "Contract"("companyId");

-- CreateIndex
CREATE INDEX "Contract_documentTypeId_idx" ON "Contract"("documentTypeId");

-- CreateIndex
CREATE INDEX "Contract_contractorId_idx" ON "Contract"("contractorId");

-- CreateIndex
CREATE INDEX "Contract_domainId_idx" ON "Contract"("domainId");

-- CreateIndex
CREATE INDEX "Contract_businesslineId_idx" ON "Contract"("businesslineId");

-- CreateIndex
CREATE INDEX "Contract_parentId_idx" ON "Contract"("parentId");

-- CreateIndex
CREATE INDEX "Contract_dateEnd_idx" ON "Contract"("dateEnd");

-- CreateIndex
CREATE INDEX "Contract_isDeleted_idx" ON "Contract"("isDeleted");

-- CreateIndex
CREATE INDEX "Contract_opinionsRequested_idx" ON "Contract"("opinionsRequested");

-- CreateIndex
CREATE INDEX "ContractLocationLink_locationId_idx" ON "ContractLocationLink"("locationId");

-- CreateIndex
CREATE INDEX "ContractUser_userId_idx" ON "ContractUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractUser_contractId_userId_key" ON "ContractUser"("contractId", "userId");

-- CreateIndex
CREATE INDEX "Attachment_contractId_idx" ON "Attachment"("contractId");

-- CreateIndex
CREATE INDEX "Attachment_contractorId_idx" ON "Attachment"("contractorId");

-- CreateIndex
CREATE INDEX "Attachment_isFinal_idx" ON "Attachment"("isFinal");

-- CreateIndex
CREATE INDEX "Opinion_contractId_idx" ON "Opinion"("contractId");

-- CreateIndex
CREATE INDEX "Opinion_opinionTypeId_idx" ON "Opinion"("opinionTypeId");

-- CreateIndex
CREATE INDEX "Opinion_userId_idx" ON "Opinion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceForm_contractId_key" ON "AcceptanceForm"("contractId");

-- CreateIndex
CREATE INDEX "Remark_contractId_idx" ON "Remark"("contractId");

-- CreateIndex
CREATE INDEX "Remark_userId_idx" ON "Remark"("userId");

-- CreateIndex
CREATE INDEX "Shoutbox_contractId_idx" ON "Shoutbox"("contractId");

-- CreateIndex
CREATE INDEX "ShoutboxRecipient_userId_isRead_idx" ON "ShoutboxRecipient"("userId", "isRead");

-- CreateIndex
CREATE INDEX "ShoutboxRecipient_shoutboxId_idx" ON "ShoutboxRecipient"("shoutboxId");

-- CreateIndex
CREATE INDEX "ContractHistory_contractId_createdAt_idx" ON "ContractHistory"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractHistory_userId_idx" ON "ContractHistory"("userId");

-- CreateIndex
CREATE INDEX "MailingContact_mailingGroupId_idx" ON "MailingContact"("mailingGroupId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_businesslineId_fkey" FOREIGN KEY ("businesslineId") REFERENCES "Businessline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupHistory" ADD CONSTRAINT "UserGroupHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupHistory" ADD CONSTRAINT "UserGroupHistory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ContractStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_businesslineId_fkey" FOREIGN KEY ("businesslineId") REFERENCES "Businessline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_natureId_fkey" FOREIGN KEY ("natureId") REFERENCES "ContractNature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_primaryLocationId_fkey" FOREIGN KEY ("primaryLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_noticePeriodId_fkey" FOREIGN KEY ("noticePeriodId") REFERENCES "NoticePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_deliveryMethodId_fkey" FOREIGN KEY ("deliveryMethodId") REFERENCES "DeliveryMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLocationLink" ADD CONSTRAINT "ContractLocationLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLocationLink" ADD CONSTRAINT "ContractLocationLink_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractUser" ADD CONSTRAINT "ContractUser_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractUser" ADD CONSTRAINT "ContractUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionType" ADD CONSTRAINT "OpinionType_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_opinionTypeId_fkey" FOREIGN KEY ("opinionTypeId") REFERENCES "OpinionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceForm" ADD CONSTRAINT "AcceptanceForm_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shoutbox" ADD CONSTRAINT "Shoutbox_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shoutbox" ADD CONSTRAINT "Shoutbox_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shoutbox" ADD CONSTRAINT "Shoutbox_remarkId_fkey" FOREIGN KEY ("remarkId") REFERENCES "Remark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoutboxRecipient" ADD CONSTRAINT "ShoutboxRecipient_shoutboxId_fkey" FOREIGN KEY ("shoutboxId") REFERENCES "Shoutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoutboxRecipient" ADD CONSTRAINT "ShoutboxRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractHistory" ADD CONSTRAINT "ContractHistory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractHistory" ADD CONSTRAINT "ContractHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingContact" ADD CONSTRAINT "MailingContact_mailingGroupId_fkey" FOREIGN KEY ("mailingGroupId") REFERENCES "MailingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
