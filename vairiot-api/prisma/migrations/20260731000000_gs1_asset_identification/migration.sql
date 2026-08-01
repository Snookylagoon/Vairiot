-- CreateEnum
CREATE TYPE "TenantIdMode" AS ENUM ('INTERNAL', 'GS1');

-- CreateEnum
CREATE TYPE "Gs1PrefixStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AllocationAuthority" AS ENUM ('SERVER', 'STANDALONE');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "IdentifierBlockStatus" AS ENUM ('ISSUED', 'SETTLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EpcScheme" AS ENUM ('GIAI96', 'GIAI202', 'TID96');

-- CreateEnum
CREATE TYPE "TagFormFactor" AS ENUM ('LABEL', 'ON_METAL', 'HARD_TAG', 'SEWN_IN', 'PLATE');

-- CreateEnum
CREATE TYPE "RfidTagState" AS ENUM ('BLANK', 'COMMISSIONED', 'QUARANTINED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CarrierType" AS ENUM ('RFID_UHF', 'QR', 'GS1_128', 'DATAMATRIX', 'NONE');

-- CreateEnum
CREATE TYPE "SecondaryIdentifierScheme" AS ENUM ('LEGACY_TAG', 'SGTIN', 'MANUFACTURER_SERIAL', 'FINANCE_REF', 'GDTI', 'GIAI_HISTORIC', 'STANDALONE_IAR', 'VIN', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetEventType" AS ENUM ('CREATED', 'MIGRATED', 'TAG_COMMISSIONED', 'TAG_VERIFIED', 'TAG_REENCODED', 'TAG_RETIRED', 'RETAGGED', 'TRANSFERRED', 'CUSTODIAN_CHANGED', 'CONDITION_ASSESSED', 'MAINTAINED', 'IMPAIRED', 'REVALUED', 'OBSERVED', 'DISPOSED', 'REINSTATED', 'IDENTIFIER_ASSIGNED', 'GIAI_ACTIVATED', 'GIAI_SUPERSEDED');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "allocationAuthority" "AllocationAuthority",
ADD COLUMN     "giai" TEXT,
ADD COLUMN     "gs1PrefixId" TEXT,
ADD COLUMN     "individualAssetReference" TEXT;

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "regionalBand" TEXT,
ADD COLUMN     "tagKeyVersion" INTEGER,
ADD COLUMN     "workspaceNumber" INTEGER;

-- CreateTable
CREATE TABLE "tenant_identifications" (
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tenantMark" TEXT,
    "mode" "TenantIdMode" NOT NULL DEFAULT 'INTERNAL',
    "filterValue" INTEGER NOT NULL DEFAULT 0,
    "allowGiai202" BOOLEAN NOT NULL DEFAULT false,
    "allowInternalPermalock" BOOLEAN NOT NULL DEFAULT false,
    "settlingPeriodDays" INTEGER NOT NULL DEFAULT 90,
    "tidSampleRate" DECIMAL(4,3) NOT NULL DEFAULT 0.05,
    "digitalLinkHost" TEXT NOT NULL DEFAULT 'id.vairiot.com',
    "readerProfiles" JSONB NOT NULL DEFAULT '{}',
    "confidenceThresholds" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_identifications_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_gs1_prefixes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "gs1MemberOrg" TEXT NOT NULL,
    "licensedOn" TIMESTAMP(3),
    "capacity" INTEGER,
    "status" "Gs1PrefixStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_gs1_prefixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identifier_allocations" (
    "tenantId" TEXT NOT NULL,
    "individualAssetReference" TEXT NOT NULL,
    "authority" "AllocationAuthority" NOT NULL,
    "sequenceValue" BIGINT,
    "status" "AllocationStatus" NOT NULL DEFAULT 'CONSUMED',
    "blockId" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedBy" TEXT,
    "purpose" TEXT NOT NULL,
    "consumedByAssetId" TEXT,

    CONSTRAINT "identifier_allocations_pkey" PRIMARY KEY ("tenantId","individualAssetReference")
);

-- CreateTable
CREATE TABLE "identifier_blocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "firstSequence" BIGINT NOT NULL,
    "lastSequence" BIGINT NOT NULL,
    "nextUnconsumed" BIGINT,
    "status" "IdentifierBlockStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedToUser" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "identifier_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfid_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tidHex" TEXT NOT NULL,
    "epcHex" TEXT,
    "epcScheme" "EpcScheme",
    "filterValue" INTEGER,
    "chipModel" TEXT,
    "tagModel" TEXT,
    "formFactor" "TagFormFactor" NOT NULL,
    "state" "RfidTagState" NOT NULL DEFAULT 'BLANK',
    "tagKeyVersion" INTEGER,
    "killPwdSet" BOOLEAN NOT NULL DEFAULT false,
    "lockState" JSONB NOT NULL DEFAULT '{}',
    "commissionedAt" TIMESTAMP(3),
    "commissionedBy" TEXT,
    "commissionedDeviceId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyResult" JSONB,
    "quarantineReason" TEXT,
    "retiredAt" TIMESTAMP(3),
    "retireReason" TEXT,

    CONSTRAINT "rfid_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_tag_bindings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tagId" TEXT,
    "carrierType" "CarrierType" NOT NULL,
    "payload" TEXT,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundBy" TEXT NOT NULL,
    "boundDeviceId" TEXT,
    "unboundAt" TIMESTAMP(3),
    "unbindReason" TEXT,

    CONSTRAINT "asset_tag_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_secondary_identifiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "scheme" "SecondaryIdentifierScheme" NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "asset_secondary_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_prints" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "symbology" "CarrierType" NOT NULL,
    "payload" TEXT NOT NULL,
    "hri" TEXT NOT NULL,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedBy" TEXT NOT NULL,
    "deviceId" TEXT,
    "printerId" TEXT,
    "scanVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "label_prints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "eventType" "AssetEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "deviceId" TEXT,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "prevHash" BYTEA,
    "hash" BYTEA NOT NULL DEFAULT '\x'::bytea,

    CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_identifications_slug_key" ON "tenant_identifications"("slug");

-- CreateIndex
CREATE INDEX "tenant_gs1_prefixes_tenantId_idx" ON "tenant_gs1_prefixes"("tenantId");

-- CreateIndex
CREATE INDEX "identifier_allocations_blockId_idx" ON "identifier_allocations"("blockId");

-- CreateIndex
CREATE INDEX "identifier_blocks_deviceId_status_idx" ON "identifier_blocks"("deviceId", "status");

-- CreateIndex
CREATE INDEX "identifier_blocks_tenantId_status_idx" ON "identifier_blocks"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_tags_tidHex_key" ON "rfid_tags"("tidHex");

-- CreateIndex
CREATE INDEX "rfid_tags_tenantId_state_idx" ON "rfid_tags"("tenantId", "state");

-- CreateIndex
CREATE INDEX "rfid_tags_epcHex_idx" ON "rfid_tags"("epcHex");

-- CreateIndex
CREATE INDEX "asset_tag_bindings_assetId_idx" ON "asset_tag_bindings"("assetId");

-- CreateIndex
CREATE INDEX "asset_tag_bindings_tagId_idx" ON "asset_tag_bindings"("tagId");

-- CreateIndex
CREATE INDEX "asset_secondary_identifiers_tenantId_scheme_value_idx" ON "asset_secondary_identifiers"("tenantId", "scheme", "value");

-- CreateIndex
CREATE UNIQUE INDEX "asset_secondary_identifiers_assetId_scheme_value_key" ON "asset_secondary_identifiers"("assetId", "scheme", "value");

-- CreateIndex
CREATE INDEX "label_prints_tenantId_assetId_idx" ON "label_prints"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "asset_events_tenantId_assetId_idx" ON "asset_events"("tenantId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_events_assetId_seq_key" ON "asset_events"("assetId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_individualAssetReference_key" ON "assets"("tenantId", "individualAssetReference");

-- CreateIndex
CREATE UNIQUE INDEX "assets_giai_key" ON "assets"("giai");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_gs1PrefixId_fkey" FOREIGN KEY ("gs1PrefixId") REFERENCES "tenant_gs1_prefixes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_identifications" ADD CONSTRAINT "tenant_identifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_gs1_prefixes" ADD CONSTRAINT "tenant_gs1_prefixes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifier_allocations" ADD CONSTRAINT "identifier_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifier_allocations" ADD CONSTRAINT "identifier_allocations_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "identifier_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifier_blocks" ADD CONSTRAINT "identifier_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifier_blocks" ADD CONSTRAINT "identifier_blocks_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_tags" ADD CONSTRAINT "rfid_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_tag_bindings" ADD CONSTRAINT "asset_tag_bindings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_tag_bindings" ADD CONSTRAINT "asset_tag_bindings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_tag_bindings" ADD CONSTRAINT "asset_tag_bindings_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "rfid_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_secondary_identifiers" ADD CONSTRAINT "asset_secondary_identifiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_secondary_identifiers" ADD CONSTRAINT "asset_secondary_identifiers_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═════════════════════════════════════════════════════════════════════════════
-- Part 2 — GS1 invariants (spec §5): check-digit functions, per-tenant
-- sequences, block leasing, GIAI maintenance, IAR immutability, hash-chained
-- event log, append-only rules, partial unique indexes.
-- Column names follow this platform's quoted-camelCase convention; the tenancy
-- anchor is tenants(id) TEXT per spec §1.1.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Check digit and IAR helpers (mirror @vairiot shared TS — byte-identical) ──

CREATE OR REPLACE FUNCTION gs1_check_digit(body text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE total integer := 0; i integer; w integer := 3;
BEGIN
  IF body !~ '^\d+$' THEN RAISE EXCEPTION 'gs1_check_digit: non-numeric body %', body; END IF;
  FOR i IN REVERSE length(body)..1 LOOP
    total := total + (substr(body, i, 1))::integer * w;
    w := CASE WHEN w = 3 THEN 1 ELSE 3 END;
  END LOOP;
  RETURN (10 - (total % 10)) % 10;
END $$;

CREATE OR REPLACE FUNCTION is_valid_iar(iar text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT iar ~ '^[12]\d{11}$'
     AND substr(iar, 12, 1)::integer = gs1_check_digit(substr(iar, 1, 11));
$$;

CREATE OR REPLACE FUNCTION build_iar_server(sequence_value bigint) RETURNS varchar(12)
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE body text;
BEGIN
  IF sequence_value < 1 OR sequence_value >= 10000000000 THEN
    RAISE EXCEPTION 'build_iar_server: sequence out of range %', sequence_value;
  END IF;
  body := '1' || lpad(sequence_value::text, 10, '0');
  RETURN body || gs1_check_digit(body)::text;
END $$;

CREATE OR REPLACE FUNCTION build_iar_standalone(workspace int, sequence_value bigint)
RETURNS varchar(12) LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE body text;
BEGIN
  IF workspace < 1 OR workspace > 99 THEN
    RAISE EXCEPTION 'build_iar_standalone: workspace out of range %', workspace;
  END IF;
  IF sequence_value < 1 OR sequence_value >= 100000000 THEN
    RAISE EXCEPTION 'build_iar_standalone: sequence out of range %', sequence_value;
  END IF;
  body := '2' || lpad(workspace::text, 2, '0') || lpad(sequence_value::text, 8, '0');
  RETURN body || gs1_check_digit(body)::text;
END $$;

-- ── Per-tenant sequences and server-side allocation ──────────────────────────

CREATE OR REPLACE FUNCTION asset_reference_seq_name(p_tenant text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT format('asset_ref_seq_%s', regexp_replace(p_tenant, '[^a-zA-Z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION provision_tenant_identifier_seq(p_tenant text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1 INCREMENT BY 1 NO CYCLE',
                 asset_reference_seq_name(p_tenant));
END $$;

-- Allocates one server IAR and records it as CONSUMED. Sequences are
-- non-transactional, so a rolled-back caller still burns the number — the
-- allocation row makes that visible rather than mysterious.
CREATE OR REPLACE FUNCTION allocate_iar(p_tenant text, p_user text, p_purpose text)
RETURNS varchar(12) LANGUAGE plpgsql AS $$
DECLARE seq_val bigint; iar varchar(12);
BEGIN
  PERFORM provision_tenant_identifier_seq(p_tenant);
  EXECUTE format('SELECT nextval(%L::regclass)', asset_reference_seq_name(p_tenant)) INTO seq_val;
  iar := build_iar_server(seq_val);
  INSERT INTO "identifier_allocations"
    ("tenantId", "individualAssetReference", "authority", "sequenceValue",
     "status", "allocatedBy", "purpose")
  VALUES (p_tenant, iar, 'SERVER', seq_val, 'CONSUMED', p_user, p_purpose);
  RETURN iar;
END $$;

-- Block leasing for offline allocation. Runs under a per-tenant advisory lock
-- so blocks can never overlap.
CREATE OR REPLACE FUNCTION lease_identifier_block(
  p_id text, p_tenant text, p_device text, p_user text, p_size int, p_ttl_hours int)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE seq text; first_val bigint; last_val bigint; i bigint;
BEGIN
  IF p_size < 1 OR p_size > 5000 THEN
    RAISE EXCEPTION 'BLOCK_SIZE_OUT_OF_RANGE %', p_size;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant));
  PERFORM provision_tenant_identifier_seq(p_tenant);
  seq := asset_reference_seq_name(p_tenant);
  EXECUTE format('SELECT nextval(%L::regclass)', seq) INTO first_val;
  last_val := first_val + p_size - 1;
  PERFORM setval(seq::regclass, last_val);

  INSERT INTO "identifier_blocks"
    ("id", "tenantId", "deviceId", "firstSequence", "lastSequence", "nextUnconsumed",
     "issuedToUser", "expiresAt")
  VALUES (p_id, p_tenant, p_device, first_val, last_val, first_val, p_user,
          now() + make_interval(hours => p_ttl_hours));

  FOR i IN first_val..last_val LOOP
    INSERT INTO "identifier_allocations"
      ("tenantId", "individualAssetReference", "authority", "sequenceValue",
       "status", "blockId", "allocatedBy", "purpose")
    VALUES (p_tenant, build_iar_server(i), 'SERVER', i, 'RESERVED', p_id, p_user,
            'BLOCK_LEASE');
  END LOOP;
  RETURN p_id;
END $$;

-- ── GIAI maintenance: derived from the tenant's ACTIVE prefix, never authored ─

CREATE OR REPLACE FUNCTION asset_sync_giai() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  IF NEW."individualAssetReference" IS NULL THEN
    NEW."giai" := NULL;
    NEW."gs1PrefixId" := NULL;
    RETURN NEW;
  END IF;
  SELECT id, prefix INTO p
    FROM "tenant_gs1_prefixes"
   WHERE "tenantId" = NEW."tenantId" AND status = 'ACTIVE'
   LIMIT 1;
  IF p.id IS NULL THEN
    NEW."giai" := NULL;
    NEW."gs1PrefixId" := NULL;
  ELSE
    NEW."gs1PrefixId" := p.id;
    NEW."giai" := p.prefix || NEW."individualAssetReference";
    IF length(NEW."giai") > 30 THEN
      RAISE EXCEPTION 'GIAI exceeds 30 characters: %', NEW."giai";
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_asset_sync_giai BEFORE INSERT OR UPDATE ON "assets"
  FOR EACH ROW EXECUTE FUNCTION asset_sync_giai();

-- The IAR is immutable once any carrier has been bound.
CREATE OR REPLACE FUNCTION asset_iar_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."individualAssetReference" IS NOT NULL
     AND NEW."individualAssetReference" IS DISTINCT FROM OLD."individualAssetReference"
     AND EXISTS (SELECT 1 FROM "asset_tag_bindings" b WHERE b."assetId" = OLD.id) THEN
    RAISE EXCEPTION 'IAR_IMMUTABLE: individualAssetReference is immutable once a carrier is bound (asset %)',
      OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_asset_iar_immutable BEFORE UPDATE ON "assets"
  FOR EACH ROW EXECUTE FUNCTION asset_iar_immutable();

-- ── Prefix activation / supersession ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION activate_tenant_prefix(p_tenant text, p_prefix_id text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer := 0; batch integer; cutoff timestamptz := now();
BEGIN
  -- Preserve any superseded GIAI BEFORE the trigger overwrites it.
  INSERT INTO "asset_secondary_identifiers"
    ("id", "tenantId", "assetId", "scheme", "value", "validTo")
  SELECT gen_random_uuid()::text, a."tenantId", a.id, 'GIAI_HISTORIC', a."giai", cutoff
    FROM "assets" a WHERE a."tenantId" = p_tenant AND a."giai" IS NOT NULL
  ON CONFLICT ("assetId", "scheme", "value") DO NOTHING;

  UPDATE "tenant_gs1_prefixes"
     SET status = 'SUPERSEDED', "supersededAt" = cutoff
   WHERE "tenantId" = p_tenant AND status = 'ACTIVE';

  UPDATE "tenant_gs1_prefixes"
     SET status = 'ACTIVE', "activatedAt" = cutoff
   WHERE id = p_prefix_id AND "tenantId" = p_tenant AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prefix % not PENDING for tenant %', p_prefix_id, p_tenant;
  END IF;

  UPDATE "tenant_identifications" SET mode = 'GS1', "updatedAt" = cutoff
   WHERE "tenantId" = p_tenant;

  -- Recompute in batches; the BEFORE trigger does the work and stamps
  -- "gs1PrefixId", which is what drops each batch out of the queue.
  -- ("updatedAt" is TIMESTAMP(3) — millisecond-rounded — so it cannot be
  -- compared against the microsecond cutoff without looping forever.)
  LOOP
    UPDATE "assets" SET "updatedAt" = now()
     WHERE id IN (SELECT id FROM "assets"
                   WHERE "tenantId" = p_tenant
                     AND "individualAssetReference" IS NOT NULL
                     AND "gs1PrefixId" IS DISTINCT FROM p_prefix_id
                   LIMIT 10000);
    GET DIAGNOSTICS batch = ROW_COUNT;
    n := n + batch;
    EXIT WHEN batch = 0;
  END LOOP;
  RETURN n;
END $$;

-- ── Append-only, hash-chained asset event log ────────────────────────────────

CREATE OR REPLACE FUNCTION asset_event_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev record;
BEGIN
  SELECT seq, hash INTO prev FROM "asset_events"
   WHERE "assetId" = NEW."assetId" ORDER BY seq DESC LIMIT 1;
  NEW.seq := COALESCE(prev.seq, 0) + 1;
  NEW."prevHash" := prev.hash;
  NEW.hash := digest(
    coalesce(encode(prev.hash, 'hex'), '') || NEW."assetId" || NEW.seq::text ||
    NEW."eventType"::text || NEW."occurredAt"::text || NEW.payload::text, 'sha256');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_asset_event_chain BEFORE INSERT ON "asset_events"
  FOR EACH ROW EXECUTE FUNCTION asset_event_chain();

CREATE OR REPLACE FUNCTION asset_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "assets" a WHERE a.id = OLD."assetId") THEN
    -- FK cascade from a hard-deleted asset (admin purge); the direct path is blocked.
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'asset_events is append-only (%)', TG_OP;
END $$;
CREATE TRIGGER trg_asset_event_no_update BEFORE UPDATE ON "asset_events"
  FOR EACH ROW EXECUTE FUNCTION asset_event_append_only();
CREATE TRIGGER trg_asset_event_no_delete BEFORE DELETE ON "asset_events"
  FOR EACH ROW EXECUTE FUNCTION asset_event_append_only();
CREATE INDEX ix_asset_event_asset_seq ON "asset_events" ("assetId", seq DESC);

-- ── Constraints the ORM cannot express ───────────────────────────────────────

ALTER TABLE "identifier_allocations"
  ADD CONSTRAINT iar_valid CHECK (is_valid_iar("individualAssetReference"));
ALTER TABLE "assets"
  ADD CONSTRAINT assets_iar_valid
  CHECK ("individualAssetReference" IS NULL OR is_valid_iar("individualAssetReference"));
ALTER TABLE "tenant_identifications"
  ADD CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$');
ALTER TABLE "tenant_identifications"
  ADD CONSTRAINT filter_value_range CHECK ("filterValue" BETWEEN 0 AND 7);
ALTER TABLE "tenant_gs1_prefixes"
  ADD CONSTRAINT prefix_numeric CHECK (prefix ~ '^\d{6,12}$');
ALTER TABLE "tenant_gs1_prefixes"
  ADD CONSTRAINT prefix_fits_giai CHECK (length(prefix) + 12 <= 30);
ALTER TABLE "identifier_blocks"
  ADD CONSTRAINT block_range CHECK ("lastSequence" >= "firstSequence");
ALTER TABLE "identifier_blocks"
  ADD CONSTRAINT block_size CHECK ("lastSequence" - "firstSequence" < 5000);
ALTER TABLE "rfid_tags"
  ADD CONSTRAINT tid_hex_format CHECK ("tidHex" ~ '^[0-9A-F]+$');
ALTER TABLE "rfid_tags"
  ADD CONSTRAINT epc_hex_format CHECK ("epcHex" IS NULL OR "epcHex" ~ '^[0-9A-F]+$');
ALTER TABLE "rfid_tags"
  ADD CONSTRAINT tag_filter_value_range
  CHECK ("filterValue" IS NULL OR "filterValue" BETWEEN 0 AND 7);
ALTER TABLE "asset_tag_bindings"
  ADD CONSTRAINT rfid_needs_tag CHECK ("carrierType" <> 'RFID_UHF' OR "tagId" IS NOT NULL);
ALTER TABLE "devices"
  ADD CONSTRAINT device_workspace_range
  CHECK ("workspaceNumber" IS NULL OR "workspaceNumber" BETWEEN 1 AND 99);

-- ── Partial unique indexes (state-scoped uniqueness) ─────────────────────────

-- At most one ACTIVE prefix per tenant.
CREATE UNIQUE INDEX ux_tenant_prefix_active
  ON "tenant_gs1_prefixes" ("tenantId") WHERE status = 'ACTIVE';
-- A licensed prefix belongs to exactly one organisation, globally.
CREATE UNIQUE INDEX ux_prefix_global
  ON "tenant_gs1_prefixes" (prefix) WHERE status IN ('PENDING', 'ACTIVE');
-- EPCs are unique globally among non-retired tags (a replacement tag for the
-- same asset legitimately re-uses the GIAI-96 EPC after the old tag retires).
CREATE UNIQUE INDEX ux_tag_epc_active
  ON "rfid_tags" ("epcHex") WHERE "epcHex" IS NOT NULL AND "retiredAt" IS NULL;
-- A tag is bound to at most one asset at a time.
CREATE UNIQUE INDEX ux_binding_tag_active
  ON "asset_tag_bindings" ("tagId") WHERE "tagId" IS NOT NULL AND "unboundAt" IS NULL;
-- Workspace numbers are unique per tenant across device-only handhelds.
CREATE UNIQUE INDEX ux_device_workspace
  ON "devices" ("tenantId", "workspaceNumber") WHERE "workspaceNumber" IS NOT NULL;

-- ── Grant the new GS1 permissions to existing system roles ──────────────────
-- (New tenants receive them from ROLE_PERMISSION_MATRIX at registration.)

UPDATE "roles" SET permissions = permissions || '{gs1:admin,tag:commission,device:manage}'
 WHERE "isSystem" = true AND name IN ('Company Admin', 'Platform Super Admin')
   AND NOT permissions @> '{gs1:admin}';
UPDATE "roles" SET permissions = permissions || '{tag:commission,device:manage}'
 WHERE "isSystem" = true AND name = 'Asset Manager' AND NOT permissions @> '{tag:commission}';
UPDATE "roles" SET permissions = permissions || '{tag:commission}'
 WHERE "isSystem" = true AND name = 'Data Collector' AND NOT permissions @> '{tag:commission}';
