-- Stage 2.7: the person or unit accountable for an asset.
--
-- Free text, as transfers already record `fromCustodian` / `toCustodian`; a
-- checkout's custodian is who holds the asset for now, this is who answers
-- for it. Components take their parent's custodian (S2.2). Back-filled from
-- each asset's latest transfer that named one.

ALTER TABLE "assets" ADD COLUMN "custodian" TEXT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_custodian_check"
  CHECK ("custodian" IS NULL OR length("custodian") BETWEEN 1 AND 120);

UPDATE "assets" a
SET "custodian" = left(t."toCustodian", 120)
FROM (
  SELECT DISTINCT ON ("assetId") "assetId", "toCustodian"
  FROM "transfers"
  WHERE "toCustodian" IS NOT NULL AND btrim("toCustodian") <> ''
  ORDER BY "assetId", "transferDate" DESC, "createdAt" DESC
) t
WHERE a."id" = t."assetId";
