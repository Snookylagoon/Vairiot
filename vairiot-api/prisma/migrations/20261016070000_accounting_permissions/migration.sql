-- Phase 2, stage 2.1 (D16): accounting permissions on existing roles.
--
-- Roles are stored per tenant, so a new permission in ROLE_PERMISSION_MATRIX
-- reaches only tenants created afterwards. This grants the same permissions
-- to the built-in roles every existing tenant already has, and to the TUDA
-- roles (seed:tuda, tenant "tuda"), matching vairiot-shared and seed-tuda.ts.
-- Idempotent: a permission already present is not added twice.

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

-- Built-in roles (every tenant)
SELECT pg_temp.grant_permissions('Platform Super Admin', ARRAY['accounting:read', 'accounting:write', 'accounting:approve']);
SELECT pg_temp.grant_permissions('Company Admin',        ARRAY['accounting:read', 'accounting:write', 'accounting:approve']);
SELECT pg_temp.grant_permissions('Asset Manager',        ARRAY['accounting:read']);
SELECT pg_temp.grant_permissions('Auditor',              ARRAY['accounting:read']);

-- TUDA roles
SELECT pg_temp.grant_permissions('Administrator',     ARRAY['accounting:read', 'accounting:write'], 'tuda');
SELECT pg_temp.grant_permissions('Finance',           ARRAY['accounting:read', 'accounting:write', 'accounting:approve'], 'tuda');
SELECT pg_temp.grant_permissions('Inventory Manager', ARRAY['accounting:read'], 'tuda');
