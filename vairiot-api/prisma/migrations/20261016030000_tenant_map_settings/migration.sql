-- Per-tenant base map for the web maps (Phase 1 W4, stage 1.12): tile
-- server, attribution, default centre and zoom. Empty means the defaults.
ALTER TABLE "tenants" ADD COLUMN "mapSettings" JSONB NOT NULL DEFAULT '{}';
