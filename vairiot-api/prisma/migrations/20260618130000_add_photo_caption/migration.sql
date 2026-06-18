-- Sprint 14: add caption + updatedAt to photos for in-place editing
ALTER TABLE "photos" ADD COLUMN "caption" TEXT;
ALTER TABLE "photos" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
