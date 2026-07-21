-- One-time fix-up for databases that applied migrations under their old
-- date-only folder names (e.g. "20260619_add_licence_number"). Those folders
-- sorted as midnight, BEFORE the same day's timestamped migrations they depend
-- on — fine for databases migrated incrementally, broken for fresh installs.
-- The folders were renamed to sorted timestamps; this renames the matching
-- rows in _prisma_migrations so `migrate deploy` doesn't re-apply them.
--
-- Safe to run repeatedly, and a no-op on fresh databases (no
-- _prisma_migrations table yet) and on already-fixed ones (no matching rows).
-- Run automatically by the migrate service before `prisma migrate deploy`.

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = '_prisma_migrations'
  ) THEN
    UPDATE "_prisma_migrations" SET migration_name = '20260619200001_add_licence_number'           WHERE migration_name = '20260619_add_licence_number';
    UPDATE "_prisma_migrations" SET migration_name = '20260619200002_add_maintenance_event_photo'  WHERE migration_name = '20260619_add_maintenance_event_photo';
    UPDATE "_prisma_migrations" SET migration_name = '20260619200003_audit_category_and_asset_scopes' WHERE migration_name = '20260619_audit_category_and_asset_scopes';
    UPDATE "_prisma_migrations" SET migration_name = '20260619200004_device_user_licence'          WHERE migration_name = '20260619_device_user_licence';
    UPDATE "_prisma_migrations" SET migration_name = '20260620200001_blind_audit'                  WHERE migration_name = '20260620_blind_audit';
    UPDATE "_prisma_migrations" SET migration_name = '20260620200002_remove_tenant_slug'           WHERE migration_name = '20260620_remove_tenant_slug';
    UPDATE "_prisma_migrations" SET migration_name = '20260620200003_tenant_parent_child'          WHERE migration_name = '20260620_tenant_parent_child';
    UPDATE "_prisma_migrations" SET migration_name = '20260620200004_user_permission_overrides'    WHERE migration_name = '20260620_user_permission_overrides';
    UPDATE "_prisma_migrations" SET migration_name = '20260621200001_add_thumb_storage_key'        WHERE migration_name = '20260621_add_thumb_storage_key';
    UPDATE "_prisma_migrations" SET migration_name = '20260622200001_company_currency'             WHERE migration_name = '20260622_company_currency';
    UPDATE "_prisma_migrations" SET migration_name = '20260622200002_smtp_config'                  WHERE migration_name = '20260622_smtp_config';
    UPDATE "_prisma_migrations" SET migration_name = '20260623200001_mobile_releases'              WHERE migration_name = '20260623_mobile_releases';
    UPDATE "_prisma_migrations" SET migration_name = '20260623200002_normalize_asset_numbers'      WHERE migration_name = '20260623_normalize_asset_numbers';
    UPDATE "_prisma_migrations" SET migration_name = '20260623200003_user_soft_delete'             WHERE migration_name = '20260623_user_soft_delete';
  END IF;
END $$;
