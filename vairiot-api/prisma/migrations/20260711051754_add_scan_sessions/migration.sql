-- CreateTable
CREATE TABLE "scan_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "categoryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_session_tags" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "readCount" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "assetId" TEXT,

    CONSTRAINT "scan_session_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_sessions_tenantId_completedAt_idx" ON "scan_sessions"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "scan_session_tags_sessionId_idx" ON "scan_session_tags"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_session_tags_sessionId_epc_key" ON "scan_session_tags"("sessionId", "epc");

-- AddForeignKey
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_session_tags" ADD CONSTRAINT "scan_session_tags_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "scan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
