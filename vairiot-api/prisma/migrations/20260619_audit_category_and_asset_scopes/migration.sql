-- Audit campaign scoping: category column + explicit asset-list join

ALTER TABLE "audit_campaigns" ADD COLUMN "categoryId" TEXT;

CREATE TABLE "audit_campaign_assets" (
  "campaignId" TEXT NOT NULL,
  "assetId"    TEXT NOT NULL,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_campaign_assets_pkey" PRIMARY KEY ("campaignId", "assetId")
);

CREATE INDEX "audit_campaign_assets_campaignId_idx" ON "audit_campaign_assets"("campaignId");

ALTER TABLE "audit_campaign_assets"
  ADD CONSTRAINT "audit_campaign_assets_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
