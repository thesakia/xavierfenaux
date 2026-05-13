import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/queues/connection";

const queues = new Map<string, Queue>();

function getQueue(name: string) {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection: getRedisConnection() });
  queues.set(name, queue);
  return queue;
}

export function getTradingViewQueue() {
  return getQueue("tradingview-alerts");
}

export function getNewsQueue() {
  return getQueue("news-scan");
}

export function getScoringQueue() {
  return getQueue("opportunity-scoring");
}
