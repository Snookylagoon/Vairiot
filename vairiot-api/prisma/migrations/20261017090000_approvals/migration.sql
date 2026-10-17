-- Phase 3, stage 3.2 (S3.1, D22): maker-checker approvals.
--
-- A request holds the change that was asked for; the action's own service
-- applies it only when another person approves. Rules give, per action, the
-- amount from which approval is needed and the role that decides, in tiers.
-- With no rule for an action nothing changes: the action proceeds as before.

CREATE TYPE "ApprovalAction" AS ENUM ('CAPITALISE', 'TRANSFER', 'DISPOSE', 'WRITE_OFF', 'REGISTER_NEW');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED');

CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "minAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approverRoleId" TEXT,
    "requireDifferentUser" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_rules_min_check" CHECK ("minAmount" >= 0),
    -- Disposal and write-off are never approved by their requester (D22).
    CONSTRAINT "approval_rules_separation_check" CHECK ("requireDifferentUser" OR "action" NOT IN ('DISPOSE', 'WRITE_OFF'))
);
CREATE UNIQUE INDEX "approval_rules_tenantId_action_minAmount_key" ON "approval_rules"("tenantId", "action", "minAmount");
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_approverRoleId_fkey"
  FOREIGN KEY ("approverRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "assetId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "amount" DECIMAL(14,2),
    "summary" TEXT NOT NULL,
    "ruleId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    -- A decision is by someone else when the rule says so; the service checks
    -- the rule, this keeps the two never-self actions honest whatever happens.
    CONSTRAINT "approval_requests_separation_check" CHECK (
      "decidedBy" IS NULL OR "decidedBy" <> "requestedBy" OR "action" NOT IN ('DISPOSE', 'WRITE_OFF')),
    CONSTRAINT "approval_requests_decided_check" CHECK (
      "status" IN ('PENDING', 'CANCELLED') OR ("decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL))
);
CREATE INDEX "approval_requests_tenantId_status_idx" ON "approval_requests"("tenantId", "status");
CREATE INDEX "approval_requests_tenantId_assetId_idx" ON "approval_requests"("tenantId", "assetId");
-- One open request per action and thing: a second disposal of the same asset waits for the first.
CREATE UNIQUE INDEX "approval_requests_one_pending" ON "approval_requests"("action", "entityId") WHERE "status" = 'PENDING';
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "approval_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation (D5).
ALTER TABLE "approval_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "approval_rules"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "approval_requests"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));

-- Permissions (as stage 2.1 did for accounting): built-in roles of every
-- tenant, and the TUDA roles. Who decides each action is the rule's role.
CREATE OR REPLACE FUNCTION pg_temp.grant_permissions(role_filter TEXT, perms TEXT[], tenant_filter TEXT DEFAULT NULL)
RETURNS void AS $$
  UPDATE "roles" r
  SET "permissions" = ARRAY(SELECT DISTINCT unnest(r."permissions" || perms) ORDER BY 1),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE r."isSystem" = true
    AND r."name" = role_filter
    AND (tenant_filter IS NULL OR r."tenantId" = tenant_filter)
    AND NOT (r."permissions" @> perms);
$$ LANGUAGE sql;

SELECT pg_temp.grant_permissions('Platform Super Admin', ARRAY['approval:read', 'approval:decide']);
SELECT pg_temp.grant_permissions('Company Admin',        ARRAY['approval:read', 'approval:decide']);
SELECT pg_temp.grant_permissions('Asset Manager',        ARRAY['approval:read', 'approval:decide']);
SELECT pg_temp.grant_permissions('Auditor',              ARRAY['approval:read']);

SELECT pg_temp.grant_permissions('Administrator',     ARRAY['approval:read'], 'tuda');
SELECT pg_temp.grant_permissions('Finance',           ARRAY['approval:read', 'approval:decide'], 'tuda');
SELECT pg_temp.grant_permissions('Inventory Manager', ARRAY['approval:read', 'approval:decide'], 'tuda');
SELECT pg_temp.grant_permissions('Verifier',          ARRAY['approval:read'], 'tuda');
