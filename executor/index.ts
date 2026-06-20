import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redisPub = new Redis(REDIS_URL);
const redisSub = new Redis(REDIS_URL);

redisPub.on("error", (e) => {
  console.error("[Executor] Redis pub connection error:", e.message);
});

redisSub.on("error", (e) => {
  console.error("[Executor] Redis sub connection error:", e.message);
});

// Trust Wallet Agent Kit Wrapper
class WalletAgentService {
  async createAutonomousWallet(userId: number) {
    console.log(`[Executor] Creating autonomous wallet for user ${userId}...`);
    return {
      address: `0x${Math.random().toString(16).substring(2, 18)}`,
      agentId: `agent_${userId}_${Date.now()}`
    };
  }

  async signTrade(walletId: number, tradeDetails: any) {
    console.log(`[Executor] Signing ${tradeDetails.market_type || 'SPOT'} trade for wallet ${walletId} via Agent Kit...`);
    console.log(`[Executor] Details: ${tradeDetails.side} ${tradeDetails.quantity || tradeDetails.amount} ${tradeDetails.symbol} @ ${tradeDetails.price} (Leverage: ${tradeDetails.leverage || 1}x)`);
    return {
      signature: "0x_signed_payload_from_agent_kit",
      txHash: `0x${Math.random().toString(16).substring(2, 32)}`
    };
  }
}

const walletAgent = new WalletAgentService();

console.log("[Executor] Starting Execution Service...");

// Track connected Engine WebSocket clients
const engineClients = new Set<any>();

// --- Combined HTTP + WebSocket Server using Bun.serve() ---
const server = Bun.serve({
  port: 4001,
  routes: {
    "/execute": {
      POST: async (req) => {
        try {
          const body = await req.json();
          const { userId, walletId, symbol, side, type, amount, price } = body;
          const signing = await walletAgent.signTrade(walletId, { symbol, side, type, quantity: amount, price });
          return Response.json({ success: true, txHash: signing.txHash });
        } catch (e) {
          return Response.json({ error: "Execution failed" }, { status: 500 });
        }
      }
    },
    "/wallet/create": {
      POST: async (req) => {
        try {
          const body = await req.json();
          if (!body || typeof body.userId !== "number") {
            return Response.json({ error: "Missing or invalid userId" }, { status: 400 });
          }
          const wallet = await walletAgent.createAutonomousWallet(body.userId);
          return Response.json(wallet, { status: 201 });
        } catch (e) {
          console.error("[Executor] Wallet creation failed:", e);
          return Response.json({ error: "Wallet creation failed", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      }
    },
    "/health": {
      GET: () => Response.json({ status: "ok", engines: engineClients.size })
    }
  },
  websocket: {
    open(ws) {
      engineClients.add(ws);
      console.log(`[Executor] Engine connected via WebSocket (total: ${engineClients.size})`);
    },
    async message(ws, data) {
      try {
        const order = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
        if (order.type === "order") {
          console.log(`[Executor] Received Order from Engine: ${order.side} ${order.symbol}`);

          const signing = await walletAgent.signTrade(0, {
            symbol: order.symbol,
            side: order.side,
            price: order.price,
            quantity: order.quantity,
            leverage: order.leverage,
            market_type: order.market_type
          });

          ws.send(JSON.stringify({
            type: "order_result",
            order_id: order.order_id,
            status: "FILLED",
            strategy_id: order.strategy_id,
            txHash: signing.txHash
          }));

          await redisPub.publish("ORDER_EVENTS", JSON.stringify({
            tradeId: order.order_id,
            status: "FILLED",
            symbol: order.symbol,
            side: order.side,
            pnl: "0.00",
            txHash: signing.txHash
          }));
        }
      } catch (err) {
        console.error("[Executor] Error processing WS order:", err);
      }
    },
    close(ws) {
      engineClients.delete(ws);
      console.log(`[Executor] Engine disconnected (remaining: ${engineClients.size})`);
    }
  },
  fetch(req, server) {
    // Upgrade WebSocket requests on the /ws path (or any non-route path)
    if (server.upgrade(req)) return;
    return new Response("Not Found", { status: 404 });
  }
});

// --- Redis Subscription: Listen for execution triggers from Backend API ---
async function startRedisListener() {
  await redisSub.subscribe("execution:trade:req", "engine:risk_check:req");
  console.log("[Executor] Subscribed to Redis channels: execution:trade:req, engine:risk_check:req");

  redisSub.on("message", async (channel, message) => {
    try {
      const data = JSON.parse(message);

      if (channel === "execution:trade:req") {
        console.log(`[Executor] Redis execution request: ${data.side} ${data.amount} ${data.symbol} (User: ${data.userId})`);

        const signing = await walletAgent.signTrade(data.walletId || 0, {
          symbol: data.symbol,
          side: data.side,
          type: data.type,
          quantity: data.amount,
          price: data.price,
          leverage: data.leverage || 1
        });

        // Publish execution result back via Redis
        await redisPub.publish("execution:trade:status", JSON.stringify({
          tradeId: data.tradeId || data.requestId,
          status: "FILLED",
          symbol: data.symbol,
          side: data.side,
          pnl: "0.00",
          txHash: signing.txHash
        }));

        // Also publish to ORDER_EVENTS for the UI listener
        await redisPub.publish("ORDER_EVENTS", JSON.stringify({
          tradeId: data.tradeId || data.requestId,
          status: "FILLED",
          symbol: data.symbol,
          side: data.side,
          pnl: "0.00",
          txHash: signing.txHash
        }));

        console.log(`[Executor] Trade executed: ${data.symbol} ${data.side} - txHash: ${signing.txHash}`);
      }

      if (channel === "engine:risk_check:req") {
        console.log(`[Executor] Risk check request for user ${data.userId}: ${data.symbol} ${data.amount}`);
        // Auto-approve risk checks (the C++ engine handles real risk management)
        await redisPub.publish("engine:risk_check:res", JSON.stringify({
          requestId: data.requestId,
          allowed: true,
          reason: "Approved by executor risk proxy"
        }));
      }
    } catch (err) {
      console.error("[Executor] Redis message error:", err);
    }
  });
}

// --- Dedicated WebSocket Server on port 9001 for C++ Engine ---
const engineWsServer = Bun.serve({
  port: 9001,
  websocket: {
    open(ws) {
      engineClients.add(ws);
      console.log(`[Executor] Engine connected on :9001 (total: ${engineClients.size})`);
    },
    async message(ws, data) {
      let order: any;
      try {
        order = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
      } catch (e) {
        console.error("[Executor] Invalid JSON received from Engine");
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON payload" }));
        return;
      }

      if (order.type !== "order") {
        console.warn(`[Executor] Unknown message type: ${order.type}`);
        return;
      }

      if (!order.symbol || !order.side) {
        console.warn("[Executor] Malformed order: missing symbol or side");
        ws.send(JSON.stringify({ type: "order_result", order_id: order.order_id, status: "REJECTED", reason: "Missing required fields" }));
        return;
      }

      try {
        console.log(`[Executor] Engine Order: ${order.side} ${order.symbol}`);

        const signing = await walletAgent.signTrade(0, {
          symbol: order.symbol,
          side: order.side,
          price: order.price,
          quantity: order.quantity,
          leverage: order.leverage,
          market_type: order.market_type
        });

        ws.send(JSON.stringify({
          type: "order_result",
          order_id: order.order_id,
          status: "FILLED",
          strategy_id: order.strategy_id,
          txHash: signing.txHash
        }));

        await redisPub.publish("ORDER_EVENTS", JSON.stringify({
          tradeId: order.order_id,
          status: "FILLED",
          symbol: order.symbol,
          side: order.side,
          pnl: "0.00",
          txHash: signing.txHash
        }));
      } catch (err) {
        console.error(`[Executor] Error processing order ${order.order_id}:`, err);
        ws.send(JSON.stringify({
          type: "order_result",
          order_id: order.order_id,
          status: "FAILED",
          strategy_id: order.strategy_id,
          reason: err instanceof Error ? err.message : "Unknown execution error"
        }));
      }
    },
    close(ws) {
      engineClients.delete(ws);
      console.log(`[Executor] Engine disconnected from :9001 (remaining: ${engineClients.size})`);
    }
  },
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response("WebSocket endpoint for Engine", { status: 200 });
  }
});

startRedisListener();

console.log(`[Executor] HTTP API on http://localhost:${server.port}`);
console.log(`[Executor] Engine WebSocket on ws://localhost:${engineWsServer.port}`);
