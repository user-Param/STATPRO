import { Redis } from "ioredis";
import { WebSocketServer } from "ws";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("error", (e) => {
  console.error("[Executor] Redis connection error:", e.message);
});

// Trust Wallet Agent Kit Wrapper - Now residing in the Executor
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
    console.log(`[Executor] Details: ${tradeDetails.side} ${tradeDetails.quantity} ${tradeDetails.symbol} @ ${tradeDetails.price} (Leverage: ${tradeDetails.leverage || 1}x)`);
    // This is where the actual Trust Wallet Agent Kit SDK would be used
    return {
      signature: "0x_signed_payload_from_agent_kit",
      txHash: `0x${Math.random().toString(16).substring(2, 32)}`
    };
  }
}

const walletAgent = new WalletAgentService();

console.log("🚀 Execution Service starting...");

// --- HTTP API (for Frontend/API requests) ---
const httpServer = Bun.serve({
  port: 4001,
  routes: {
    "/execute": {
      POST: async (req) => {
        try {
          const body = await req.json();
          const { userId, walletId, symbol, side, type, amount, price } = body;
          const signing = await walletAgent.signTrade(walletId, { symbol, side, type, quantity: amount, price });
          return new Response(JSON.stringify({ success: true, txHash: signing.txHash }), { status: 200 });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Execution failed" }), { status: 500 });
        }
      }
    },
    "/wallet/create": {
      POST: async (req) => {
        try {
          const body = await req.json();
          if (!body || typeof body.userId !== "number") {
            return new Response(JSON.stringify({ error: "Missing or invalid userId" }), { status: 400 });
          }
          const wallet = await walletAgent.createAutonomousWallet(body.userId);
          return new Response(JSON.stringify(wallet), { status: 201 });
        } catch (e) {
          console.error("[Executor] Wallet creation failed:", e);
          return new Response(JSON.stringify({ error: "Wallet creation failed", details: e instanceof Error ? e.message : String(e) }), { status: 500 });
        }
      }
    }
  }
});

// --- WebSocket Server (for C++ Engine / RiskManager) ---
const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  console.log("[Executor] ✓ Engine connected via WebSocket on port 9001");

  ws.on("message", async (data) => {
    let order: any;
    try {
      order = JSON.parse(data.toString());
    } catch (e) {
      console.error("[Executor] Invalid JSON received from Engine:", data.toString().substring(0, 200));
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
      console.log(`[Executor] ⚡ Received Order from Engine: ${order.side} ${order.symbol}`);

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

      await redis.publish("ORDER_EVENTS", JSON.stringify({
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
  });

  ws.on("close", () => {
    console.log("[Executor] Engine disconnected");
  });

  ws.on("error", (error) => {
    console.error("[Executor] WebSocket connection error:", error);
  });
});

wss.on("error", (error) => {
  console.error("[Executor] WebSocket server error:", error);
});

// Keep the process alive by maintaining references to the servers
// (This prevents the Bun process from exiting immediately)
const _ = { httpServer }; // eslint-disable-line no-unused-vars

console.log("Executor listening on http://localhost:4001 (HTTP) and ws://localhost:9001 (WS)");
