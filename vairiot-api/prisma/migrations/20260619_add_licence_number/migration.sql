-- AddLicenceNumber
ALTER TABLE "licences" ADD COLUMN "licenceNumber" TEXT;

-- Sequence used by the application to mint VAI-{seq}-{RAND6} numbers.
CREATE SEQUENCE IF NOT EXISTS "licence_number_seq" START WITH 1;

-- Backfill existing rows (PL/pgSQL block; uses sequence + random shortcode).
DO $$
DECLARE
  r RECORD;
  seq BIGINT;
  rand TEXT;
BEGIN
  FOR r IN SELECT id FROM "licences" WHERE "licenceNumber" IS NULL ORDER BY "createdAt" LOOP
    seq := nextval('licence_number_seq');
    -- 6-char uppercase alphanumeric (excludes confusable chars 0/O/1/I/L)
    rand := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01oil', ''), 1, 6));
    UPDATE "licences" SET "licenceNumber" = 'VAI-' || seq || '-' || rand WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "licences" ALTER COLUMN "licenceNumber" SET NOT NULL;
CREATE UNIQUE INDEX "licences_licenceNumber_key" ON "licences"("licenceNumber");
