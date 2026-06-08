-- Real-user Core Web Vitals samples shipped from the browser to /api/rum.
-- One row per metric per page navigation. Reference: audit-2026-06-06 BUNDLE-005.

CREATE TABLE "RumEvent" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT,
    "page" TEXT NOT NULL,
    "navigationType" TEXT,
    "userAgentHash" TEXT,
    "sessionIdHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RumEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RumEvent_metric_createdAt_idx" ON "RumEvent"("metric", "createdAt");
CREATE INDEX "RumEvent_page_createdAt_idx" ON "RumEvent"("page", "createdAt");
