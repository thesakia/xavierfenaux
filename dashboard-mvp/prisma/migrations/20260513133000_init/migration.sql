CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT', 'NEUTRAL');
CREATE TYPE "OpportunityStatus" AS ENUM ('WATCHING', 'VALIDATED', 'IGNORED', 'INVALIDATED', 'ARCHIVED');
CREATE TYPE "OpportunitySource" AS ENUM ('TRADINGVIEW', 'NEWS', 'IVT', 'MIX', 'MANUAL');
CREATE TYPE "NewsCategory" AS ENUM ('MACRO', 'SENTIMENT', 'RISK', 'TECHNICAL', 'OTHER');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradingViewAlert" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "timeframe" TEXT,
  "price" DECIMAL(65,30),
  "signal" TEXT NOT NULL,
  "direction" "Direction" NOT NULL,
  "indicator" TEXT,
  "message" TEXT,
  "rawPayload" JSONB NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradingViewAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XavierNotification" (
  "id" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "symbol" TEXT,
  "assetName" TEXT,
  "direction" "Direction" NOT NULL DEFAULT 'NEUTRAL',
  "timeframe" TEXT,
  "zone" TEXT,
  "invalidation" TEXT,
  "targets" JSONB,
  "confidenceLevel" INTEGER NOT NULL DEFAULT 50,
  "riskNotes" TEXT,
  "extractedSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XavierNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketNews" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "url" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "summary" TEXT,
  "relatedAssets" JSONB NOT NULL,
  "importanceScore" INTEGER NOT NULL DEFAULT 50,
  "category" "NewsCategory" NOT NULL DEFAULT 'OTHER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketNews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketContext" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "relatedAssets" JSONB NOT NULL,
  "category" "NewsCategory" NOT NULL DEFAULT 'OTHER',
  "importanceScore" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "assetName" TEXT,
  "direction" "Direction" NOT NULL,
  "entryZone" TEXT NOT NULL,
  "invalidation" TEXT NOT NULL,
  "targets" JSONB NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "status" "OpportunityStatus" NOT NULL DEFAULT 'WATCHING',
  "source" "OpportunitySource" NOT NULL,
  "summary" TEXT NOT NULL,
  "riskNotes" TEXT,
  "aiReasoningSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostLog" (
  "id" TEXT NOT NULL,
  "agent" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "relatedOpportunityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "TradingViewAlert_symbol_createdAt_idx" ON "TradingViewAlert"("symbol", "createdAt");
CREATE INDEX "TradingViewAlert_processed_createdAt_idx" ON "TradingViewAlert"("processed", "createdAt");
CREATE INDEX "XavierNotification_symbol_createdAt_idx" ON "XavierNotification"("symbol", "createdAt");
CREATE UNIQUE INDEX "MarketNews_source_title_publishedAt_key" ON "MarketNews"("source", "title", "publishedAt");
CREATE INDEX "MarketNews_publishedAt_idx" ON "MarketNews"("publishedAt");
CREATE INDEX "Opportunity_status_score_createdAt_idx" ON "Opportunity"("status", "score", "createdAt");
CREATE INDEX "Opportunity_symbol_createdAt_idx" ON "Opportunity"("symbol", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "CostLog_agent_createdAt_idx" ON "CostLog"("agent", "createdAt");
CREATE INDEX "CostLog_relatedOpportunityId_idx" ON "CostLog"("relatedOpportunityId");

ALTER TABLE "CostLog" ADD CONSTRAINT "CostLog_relatedOpportunityId_fkey"
  FOREIGN KEY ("relatedOpportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
