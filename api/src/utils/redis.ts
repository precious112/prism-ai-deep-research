import Redis from "ioredis";
import logger from "./logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = new Redis(redisUrl, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null, // Useful for blocking operations if needed
});

redisClient.on("connect", () => {
  logger.info("Redis connected successfully");
});

redisClient.on("error", (err) => {
  logger.error(err, "Redis connection error");
});

redisClient.on("reconnecting", () => {
  logger.info("Redis reconnecting...");
});

export default redisClient;
