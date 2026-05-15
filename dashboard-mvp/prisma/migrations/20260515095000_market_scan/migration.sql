CREATE TABLE "WatchedAsset" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "assetName" TEXT,
  "category" TEXT,
  "currentPrice" DECIMAL(65,30),
  "variationPct" DECIMAL(65,30),
  "shortZone" TEXT,
  "mediumZone" TEXT,
  "longZone" TEXT,
  "invalidation" TEXT,
  "targets" JSONB,
  "technicalNotes" TEXT,
  "macroNotes" TEXT,
  "lastPriceAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WatchedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketScanRun" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "summary" TEXT,
  "usedOpenAI" BOOLEAN NOT NULL DEFAULT false,
  "createdRadarItems" INTEGER NOT NULL DEFAULT 0,
  "createdOpportunities" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketScanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedRadarItem" (
  "id" TEXT NOT NULL,
  "scanRunId" TEXT,
  "symbol" TEXT NOT NULL,
  "assetName" TEXT,
  "category" TEXT,
  "currentPrice" DECIMAL(65,30),
  "variationPct" DECIMAL(65,30),
  "direction" "Direction" NOT NULL DEFAULT 'NEUTRAL',
  "priority" INTEGER NOT NULL DEFAULT 3,
  "score" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'context',
  "knownZone" TEXT,
  "zoneProximityPct" DECIMAL(65,30),
  "invalidation" TEXT,
  "targets" JSONB,
  "newsContext" TEXT,
  "xavierContext" TEXT,
  "briefContext" TEXT,
  "reasons" JSONB NOT NULL,
  "missingData" JSONB NOT NULL,
  "riskNotes" TEXT,
  "sources" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedRadarItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchedAsset_symbol_key" ON "WatchedAsset"("symbol");
CREATE INDEX "WatchedAsset_category_symbol_idx" ON "WatchedAsset"("category", "symbol");
CREATE INDEX "GeneratedRadarItem_scanRunId_priority_score_idx" ON "GeneratedRadarItem"("scanRunId", "priority", "score");
CREATE INDEX "GeneratedRadarItem_symbol_createdAt_idx" ON "GeneratedRadarItem"("symbol", "createdAt");

ALTER TABLE "GeneratedRadarItem" ADD CONSTRAINT "GeneratedRadarItem_scanRunId_fkey"
  FOREIGN KEY ("scanRunId") REFERENCES "MarketScanRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
