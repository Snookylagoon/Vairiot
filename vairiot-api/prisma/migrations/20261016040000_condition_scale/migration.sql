-- Graded condition scale and photo rules (Phase 1 W5, stage 1.13; S1.5 and
-- S1.3 step 6). The condition strings stay; the grade sits beside them.

ALTER TABLE "assets" ADD COLUMN "conditionGrade" INTEGER;
ALTER TABLE "audit_scan_events" ADD COLUMN "conditionGrade" INTEGER;
ALTER TABLE "assets" ADD CONSTRAINT "assets_condition_grade_check"
  CHECK ("conditionGrade" IS NULL OR "conditionGrade" BETWEEN 1 AND 5);
ALTER TABLE "audit_scan_events" ADD CONSTRAINT "audit_scan_events_condition_grade_check"
  CHECK ("conditionGrade" IS NULL OR "conditionGrade" BETWEEN 1 AND 5);

-- Back-fill from the strings (vairiot-shared GRADE_FROM_CONDITION).
UPDATE "assets" SET "conditionGrade" = CASE lower("condition")
  WHEN 'new' THEN 5 WHEN 'excellent' THEN 5 WHEN 'good' THEN 4 WHEN 'fair' THEN 3
  WHEN 'poor' THEN 2 WHEN 'damaged' THEN 1 WHEN 'unserviceable' THEN 1 END;
UPDATE "audit_scan_events" SET "conditionGrade" = CASE lower("condition")
  WHEN 'new' THEN 5 WHEN 'excellent' THEN 5 WHEN 'good' THEN 4 WHEN 'fair' THEN 3
  WHEN 'poor' THEN 2 WHEN 'damaged' THEN 1 WHEN 'unserviceable' THEN 1 END
WHERE "condition" IS NOT NULL;

-- A tenant's scale (categoryId NULL) and per-category overrides. Rows are
-- replaced a scale at a time, so (tenant, category, grade) stays unique.
CREATE TABLE "condition_scale_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "categoryId" TEXT,
  "grade" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "criteria" TEXT NOT NULL,
  "colour" TEXT NOT NULL,
  "impairmentIndicator" BOOLEAN NOT NULL DEFAULT false,
  "photoRequired" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "condition_scale_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "condition_scale_entries_grade_check" CHECK ("grade" BETWEEN 1 AND 5)
);
CREATE INDEX "condition_scale_entries_tenantId_categoryId_idx" ON "condition_scale_entries"("tenantId", "categoryId");
ALTER TABLE "condition_scale_entries" ADD CONSTRAINT "condition_scale_entries_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Minimum photos per scan at inventory: tenant default and category overrides.
CREATE TABLE "photo_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "categoryId" TEXT,
  "minPhotosAtInventory" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "photo_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "photo_rules_min_check" CHECK ("minPhotosAtInventory" BETWEEN 0 AND 4)
);
CREATE INDEX "photo_rules_tenantId_categoryId_idx" ON "photo_rules"("tenantId", "categoryId");
ALTER TABLE "photo_rules" ADD CONSTRAINT "photo_rules_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
