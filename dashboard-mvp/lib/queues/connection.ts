import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redisConnection?: IORedis };

export function getRedisConnection() {
  if (!globalForRedis.redisConnection) {
    globalForRedis.redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }

  return globalForRedis.redisConnection;
}
