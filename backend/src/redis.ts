import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Publisher for sending commands/events to microservices
export const redisPub = new Redis(REDIS_URL);

// Subscriber for listening to updates from microservices
export const redisSub = new Redis(REDIS_URL);

/**
 * Microservices Communication Channels
 */
export const CHANNELS = {
  // Outgoing (Backend -> Service)
  ENGINE_RISK_CHECK: "engine:risk_check:req",
  EXECUTION_TRIGGER: "execution:trade:req",
  DATAFEED_SUBSCRIPTION: "datafeed:subscribe:req",

  // Incoming (Service -> Backend)
  ENGINE_RESPONSE: "engine:risk_check:res",
  EXECUTION_STATUS: "execution:trade:status",
  DATAFEED_UPDATES: "datafeed:price:update",
  
  // General Events
  ORDER_EVENTS: "ORDER_EVENTS" // Legacy support
};

/**
 * Helper to publish message and wait for a correlated response (Request-Response over Redis)
 * Useful for synchronous-like checks (e.g., Risk Checks)
 */
export const requestResponse = async (channelReq: string, channelRes: string, data: any, timeout = 5000): Promise<any> => {
  const requestId = Math.random().toString(36).substring(7);
  const payload = JSON.stringify({ ...data, requestId });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      redisSub.off("message", handler);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response on ${channelRes} (requestId: ${requestId})`));
    }, timeout);

    const handler = (channel: string, message: string) => {
      if (channel !== channelRes) return;

      let response: any;
      try {
        response = JSON.parse(message);
      } catch (e) {
        console.error(`\x1b[31m[Redis]\x1b[0m Invalid JSON response on ${channelRes}:`, message);
        return;
      }

      if (response.requestId === requestId) {
        cleanup();
        resolve(response);
      }
    };

    redisSub.subscribe(channelRes).catch((e) => {
      cleanup();
      reject(new Error(`Failed to subscribe to ${channelRes}: ${e instanceof Error ? e.message : String(e)}`));
    });
    redisSub.on("message", handler);
    redisPub.publish(channelReq, payload).catch((e) => {
      cleanup();
      reject(new Error(`Failed to publish to ${channelReq}: ${e instanceof Error ? e.message : String(e)}`));
    });
  });
};

// Handle Redis connection errors to prevent unhandled exceptions
redisPub.on("error", (e) => {
  console.error("\x1b[31m[Redis Publisher Error]\x1b[0m", e.message);
});

redisSub.on("error", (e) => {
  console.error("\x1b[31m[Redis Subscriber Error]\x1b[0m", e.message);
});
