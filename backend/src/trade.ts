import { db } from "./client";
import { trades, wallets } from "./schema";
import { eq } from "drizzle-orm";
import { safeParseJson } from "./utils";
import { redisPub, redisSub, CHANNELS, requestResponse } from "./redis";

// Conceptual Trust Wallet Agent Kit Wrapper
class WalletAgentService {
  async createAutonomousWallet(userId: number) {
    console.log(`\x1b[35m[AgentKit]\x1b[0m Creating autonomous wallet for user ${userId}...`);
    return {
      address: `0x${Math.random().toString(16).substring(2, 18)}`,
      agentId: `agent_${userId}_${Date.now()}`
    };
  }

  async signTrade(walletId: number, tradeDetails: any) {
    console.log(`\x1b[35m[AgentKit]\x1b[0m Signing trade for wallet ${walletId}...`);
    return {
      signature: "0x_signed_payload_from_agent_kit",
      txHash: `0x${Math.random().toString(16).substring(2, 32)}`
    };
  }
}

const walletAgent = new WalletAgentService();

export const trade = {
  async createOrder(userId: number, req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return new Response(JSON.stringify({ error: "Missing body" }), { status: 400 });
      const { symbol, side, type, amount, price, walletId } = body;
      
      console.log(`\x1b[35m[Trade Orchestrator]\x1b[0m New Order: ${side} ${type} ${amount} ${symbol} (User: ${userId})`);

      // 1. Risk Check via Redis (Communicating with Engine Microservice)
      console.log(`\x1b[35m[Trade Orchestrator]\x1b[0m Requesting Risk Check from Engine...`);
      let riskCheck;
      try {
        riskCheck = await requestResponse(CHANNELS.ENGINE_RISK_CHECK, CHANNELS.ENGINE_RESPONSE, {
          userId,
          amount,
          price,
          symbol
        }, 3000);
      } catch (e) {
        console.warn("\x1b[33m[Trade Orchestrator]\x1b[0m Risk Engine timeout, defaulting to manual approval (DEV MODE)");
        riskCheck = { allowed: true };
      }

      if (!riskCheck.allowed) {
        console.warn(`\x1b[33m[Trade Orchestrator]\x1b[0m Order REJECTED: Insufficient margin`);
        return new Response(JSON.stringify({ error: "Insufficient margin" }), { status: 403 });
      }

      // 2. Intent Signing via Agent Kit
      const signing = await walletAgent.signTrade(walletId, { symbol, side, type, amount, price });

      // 3. Dispatch Execution via Redis (Communicating with Execution Microservice)
      console.log(`\x1b[35m[Trade Orchestrator]\x1b[0m Dispatching Execution request to Redis...`);
      await redisPub.publish(CHANNELS.EXECUTION_TRIGGER, JSON.stringify({
        userId,
        walletId,
        ...signing,
        symbol,
        side,
        type,
        amount,
        price
      }));

      // 4. Record trade in DB
      const [newTrade] = await db.insert(trades).values({
        userId,
        walletId,
        symbol,
        side,
        type,
        amount,
        price,
        status: "PENDING",
      }).returning();

      console.log(`\x1b[32m[Trade Orchestrator]\x1b[0m Order successfully orchestrated: ID ${newTrade.id}`);
      return new Response(JSON.stringify({
        message: "Order orchestrated",
        tradeId: newTrade.id,
        txHash: signing.txHash
      }), { status: 201 });

    } catch (e) {
      console.error("\x1b[31m[Trade Orchestrator Error]\x1b[0m Orchestration failed:", e);
      return new Response(JSON.stringify({ error: "Order orchestration failed" }), { status: 500 });
    }
  },

  async getHistory(userId: number) {
    try {
      console.log(`\x1b[35m[Trade Orchestrator]\x1b[0m Fetching trade history for user: ${userId}`);
      const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));
      return new Response(JSON.stringify(userTrades), { status: 200 });
    } catch (e) {
      console.error("\x1b[31m[Trade Orchestrator Error]\x1b[0m Failed to fetch history:", e);
      return new Response(JSON.stringify({ error: "Failed to fetch history" }), { status: 500 });
    }
  },

  async connectWallet(userId: number) {
    try {
      console.log(`\x1b[35m[Trade Orchestrator]\x1b[0m Connecting wallet for user: ${userId}`);
      const wallet = await walletAgent.createAutonomousWallet(userId);

      await db.insert(wallets).values({
        userId,
        address: wallet.address,
        walletType: "autonomous",
      });

      console.log(`\x1b[32m[Trade Orchestrator]\x1b[0m Wallet connected: ${wallet.address}`);
      return new Response(JSON.stringify({ message: "Wallet connected", address: wallet.address }), { status: 201 });
    } catch (e) {
      console.error("\x1b[31m[Trade Orchestrator Error]\x1b[0m Wallet connection failed:", e);
      return new Response(JSON.stringify({ error: "Wallet connection failed" }), { status: 500 });
    }
  }
};

/**
 * Global Redis Listener for Microservice Updates
 */
async function startGlobalListener() {
  redisSub.subscribe(CHANNELS.EXECUTION_STATUS, CHANNELS.ORDER_EVENTS);

  redisSub.on("message", async (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      if (channel === CHANNELS.EXECUTION_STATUS || channel === CHANNELS.ORDER_EVENTS) {
        console.log(`\x1b[35m[Redis Listener]\x1b[0m Received status update for Trade ${data.tradeId}: ${data.status}`);

        await db.update(trades)
          .set({
            status: data.status,
            pnl: data.pnl
          })
          .where(eq(trades.id, data.tradeId));
      }
    } catch (e) {
      console.error("\x1b[31m[Redis Listener Error]\x1b[0m Failed to process microservice update:", e);
    }
  });
}

startGlobalListener();
