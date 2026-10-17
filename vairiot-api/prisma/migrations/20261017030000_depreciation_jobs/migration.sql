-- Stage 2.10: depreciation runs are computed and posted by the worker.
--
-- The API checks a request and queues it; the worker prepares the preview,
-- posts the entries or writes the reversal, and records its progress here so
-- the web console can show it. Runs made before this stage are complete.

CREATE TYPE "RunJobState" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE "RunAction" AS ENUM ('PREPARE', 'POST', 'REVERSE');

ALTER TABLE "depreciation_runs"
  ADD COLUMN "jobState" "RunJobState" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "pendingAction" "RunAction",
  ADD COLUMN "pendingBy" TEXT,
  ADD COLUMN "pendingNotes" TEXT,
  ADD COLUMN "jobError" TEXT;

UPDATE "depreciation_runs" SET "jobState" = 'DONE';

-- At most one action in flight per period.
CREATE UNIQUE INDEX "depreciation_runs_one_job_per_period"
  ON "depreciation_runs"("periodId") WHERE "jobState" IN ('QUEUED', 'RUNNING');
