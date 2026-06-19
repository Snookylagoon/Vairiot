-- Link devices to a fingerprint, registering user, and licence

ALTER TABLE "devices" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "devices" ADD COLUMN "userId"      TEXT;
ALTER TABLE "devices" ADD COLUMN "licenceId"   TEXT;

CREATE UNIQUE INDEX "devices_tenantId_fingerprint_key" ON "devices"("tenantId", "fingerprint");
CREATE INDEX        "devices_userId_idx"               ON "devices"("userId");
CREATE INDEX        "devices_licenceId_idx"            ON "devices"("licenceId");

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_licenceId_fkey"
  FOREIGN KEY ("licenceId") REFERENCES "licences"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
