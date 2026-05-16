import type { Direction, NewsCategory, OpportunitySource } from "@prisma/client";

export type ExtractedNotification = {
  symbol: string | null;
  assetName: string | null;
  direction: Direction;
  timeframe: string | null;
  zone: string | null;
  invalidation: string | null;
  targets: string[];
  confidenceLevel: number;
  riskNotes: string | null;
  extractedSummary: string;
};

export type MarketNewsInput = {
  title: string;
  source: string;
  url?: string | null;
  publishedAt: string;
  summary?: string | null;
};

export type MarketContextResult = {
  title: string;
  summary: string;
  relatedAssets: string[];
  category: NewsCategory;
  importanceScore: number;
};

export type OpportunityCandidate = {
  accepted: boolean;
  refusalReason?: string;
  symbol?: string;
  assetName?: string | null;
  direction?: Direction;
  entryZone?: string;
  invalidation?: string;
  targets?: string[];
  source?: OpportunitySource;
  summary?: string;
  riskNotes?: string | null;
  aiReasoningSummary?: string | null;
};

export type XavierMethodReviewInput = {
  symbol: string;
  assetName?: string | null;
  category?: string | null;
  direction: Direction;
  score: number;
  price?: number | null;
  variationPct?: number | null;
  newsContext?: string | null;
  briefContext?: string | null;
  knownZone?: string | null;
  invalidation?: string | null;
  targets: string[];
  methodContext?: string | null;
};

export type XavierMethodReview = {
  scoreAdjustment: number;
  passesMethod: boolean;
  methodNotes: string;
  riskNotes: string;
};

export type CoherenceReviewInput = XavierMethodReviewInput & {
  methodReview: XavierMethodReview;
  reasons: string[];
  missingData: string[];
};

export type CoherenceReview = {
  display: boolean;
  status: "setup_candidate" | "context" | "watch_only";
  priority: number;
  scoreAdjustment: number;
  summary: string;
  refusalReason?: string;
};
