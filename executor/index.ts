import { Redis } from "ioredis";
import { WebSocketServer } from "ws";
import { WalletAgentService } from "../backend/src/wallet-agent";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const walletAgent = new WalletAgentService("Executor");

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
        const { userId } = await req.json();
        const wallet = await walletAgent.createAutonomousWallet(userId);
        return new Response(JSON.stringify(wallet), { status: 201 });
      }
    }
  }
});

// --- WebSocket Server (for C++ Engine / RiskManager) ---
const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  console.log("[Executor] ✓ Engine connected via WebSocket on port 9001");

  ws.on("message", async (data) => {
    try {
      const order = JSON.parse(data.toString());
      if (order.type === "order") {
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
      }
    } catch (err) {
      console.error("[Executor] Error processing order:", err);
    }
  });

  ws.on("close", () => {
    console.log("[Executor] Engine disconnected");
  });

  ws.on("error", (error) => {
    console.error("[Executor] WebSocket error:", error);
  });
});

wss.on("error", (error) => {
  console.error("[Executor] WebSocket server error:", error);
});

wss.on("connection", (ws) => {
  ws.on("error", (error) => {
    console.error("[Executor] WebSocket connection error:", error);
  });
});

// Keep the process alive by maintaining references to the servers
const _ = { httpServer }; // eslint-disable-line no-unused-vars

console.log("Executor listening on http://localhost:4001 (HTTP) and ws://localhost:9001 (WS)");
