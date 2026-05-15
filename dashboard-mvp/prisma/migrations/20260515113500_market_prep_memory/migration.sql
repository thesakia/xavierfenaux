CREATE TABLE "MarketPrepMemory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "summary" TEXT,
    "relatedAssets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPrepMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketPrepMemory_kind_createdAt_idx" ON "MarketPrepMemory"("kind", "createdAt");
CREATE INDEX "MarketPrepMemory_createdAt_idx" ON "MarketPrepMemory"("createdAt");
