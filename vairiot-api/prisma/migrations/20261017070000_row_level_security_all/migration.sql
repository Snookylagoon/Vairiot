-- Phase 2, stage 2.15 (W7, G23, D5): row-level security on every tenant table.
--
-- Stage 1.19 put it on assets, audit events and photos, and each Phase 2
-- table had it from its creation; this covers the rest. Inside a tenant
-- request the API runs as vairiot_rls with app.tenant_id set, so the database
-- itself returns and accepts only that tenant's rows, whatever the query.
-- Outside one (sign-in, workers, seeds, migrations, platform administration)
-- the policies let queries through, as before.
--
-- - Tables with a tenantId: the same tenant_isolation policy as the others.
-- - Child tables without one: visible and writable only when their parent row
--   is, through EXISTS on the parent, which applies the parent's own policy.
-- - Platform tables stay unscoped by design: tenants, licence_tiers,
--   mobile_releases, ios_releases, ios_devices, smtp_config, and
--   login_attempts (written before a tenant is known).
-- security/row-level-security-coverage.test.ts fails for any tenant table
-- added later without a policy.

-- ── Tables with a tenantId ───────────────────────────────────────────────
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "api_keys"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "users"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "roles"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "categories"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sites" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sites"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "disposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "disposals"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "audit_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_campaigns"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "audit_scan_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_scan_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_scan_events"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "scan_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scan_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "scan_sessions"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "checkouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkouts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "checkouts"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "documents"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "maintenance_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_events"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "alert_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alert_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "alert_subscriptions"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhooks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "webhooks"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "webhook_deliveries"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "tenant_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_usage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_usage"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "report_schedules"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_field_definitions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "custom_field_definitions"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transfers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "transfers"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "licences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "licences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "licences"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "devices"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "companies"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "client_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "client_companies"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "onboarding_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_progress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "onboarding_progress"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "user_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_invitations"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "tenant_identifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_identifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_identifications"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "tenant_gs1_prefixes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_gs1_prefixes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_gs1_prefixes"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "identifier_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identifier_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identifier_allocations"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "identifier_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identifier_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identifier_blocks"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "rfid_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rfid_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "rfid_tags"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "asset_tag_bindings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_tag_bindings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_tag_bindings"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "asset_secondary_identifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_secondary_identifiers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_secondary_identifiers"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "label_prints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "label_prints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "label_prints"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "label_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "label_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "label_templates"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "asset_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_events"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "condition_scale_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "condition_scale_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "condition_scale_entries"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));
ALTER TABLE "photo_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "photo_rules"
  USING (rls_tenant_matches("tenantId")) WITH CHECK (rls_tenant_matches("tenantId"));

-- ── Child tables, through their parent ───────────────────────────────────
ALTER TABLE "user_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_permission_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_permission_overrides"
  USING (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_permission_overrides"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_permission_overrides"."userId"));
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_roles"
  USING (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_roles"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_roles"."userId"));
ALTER TABLE "user_two_factor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_two_factor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_two_factor"
  USING (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_two_factor"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "users" p WHERE p."id" = "user_two_factor"."userId"));
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "locations"
  USING (EXISTS (SELECT 1 FROM "sites" p WHERE p."id" = "locations"."siteId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "sites" p WHERE p."id" = "locations"."siteId"));
ALTER TABLE "audit_campaign_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_campaign_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_campaign_assets"
  USING (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_campaign_assets"."campaignId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_campaign_assets"."campaignId"));
ALTER TABLE "audit_snapshot_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_snapshot_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_snapshot_assets"
  USING (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_snapshot_assets"."campaignId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_snapshot_assets"."campaignId"));
ALTER TABLE "audit_zone_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_zone_submissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_zone_submissions"
  USING (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_zone_submissions"."campaignId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_zone_submissions"."campaignId"));
ALTER TABLE "audit_reconciliation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_reconciliation_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_reconciliation_items"
  USING (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_reconciliation_items"."campaignId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_reconciliation_items"."campaignId"));
ALTER TABLE "audit_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_adjustments"
  USING (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_adjustments"."campaignId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_campaigns" p WHERE p."id" = "audit_adjustments"."campaignId"));
ALTER TABLE "scan_session_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scan_session_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "scan_session_tags"
  USING (EXISTS (SELECT 1 FROM "scan_sessions" p WHERE p."id" = "scan_session_tags"."sessionId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "scan_sessions" p WHERE p."id" = "scan_session_tags"."sessionId"));
ALTER TABLE "device_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_slots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "device_slots"
  USING (EXISTS (SELECT 1 FROM "licences" p WHERE p."id" = "device_slots"."licenceId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "licences" p WHERE p."id" = "device_slots"."licenceId"));
ALTER TABLE "client_authorities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_authorities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "client_authorities"
  USING (EXISTS (SELECT 1 FROM "client_companies" p WHERE p."id" = "client_authorities"."clientCompanyId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "client_companies" p WHERE p."id" = "client_authorities"."clientCompanyId"));
