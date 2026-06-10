import { db } from "./client";
import { trades, wallets } from "./schema";
import { eq } from "drizzle-orm";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const EXECUTOR_URL = process.env.EXECUTION_URL || "http://localhost:4000";

export const trade = {
  async createOrder(userId: number, req: Request) {
    try {
      const { symbol, side, type, amount, price, walletId } = await req.json();

      // 1. Risk Check (Sync call to Engine)
      const riskCheck = await fetch(`${process.env.ENGINE_URL}/check-margin`, {
        method: "POST",
        body: JSON.stringify({ userId, amount, price })
      }).then(res => res.json()).catch(() => ({ allowed: true }));

      if (!riskCheck.allowed) {
        return new Response(JSON.stringify({ error: "Insufficient margin" }), { status: 403 });
      }

      // 2. Record trade in DB as PENDING
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

      // 3. Signal the Executor to handle signing and blockchain broadcast
      // We pass the tradeId so the executor can report back to the correct record
      const execution = await fetch(`${EXECUTOR_URL}/execute`, {
        method: "POST",
        body: JSON.stringify({
          tradeId: newTrade.id,
          userId,
          walletId,
          symbol,
          side,
          type,
          amount,
          price
        })
      }).then(res => res.json()).catch(() => ({ success: false }));

      if (!execution.success) {
        return new Response(JSON.stringify({ error: "Execution dispatch failed" }), { status: 500 });
      }

      return new Response(JSON.stringify({
        message: "Order submitted to executor",
        tradeId: newTrade.id,
        txHash: execution.txHash
      }), { status: 201 });

    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: "Order processing failed" }), { status: 500 });
    }
  },

  async getHistory(userId: number) {
    try {
      const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));
      return new Response(JSON.stringify(userTrades), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to fetch history" }), { status: 500 });
    }
  },

  async connectWallet(userId: number) {
    try {
      // The API now delegates wallet creation to the Executor
      const response = await fetch(`${EXECUTOR_URL}/wallet/create`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      const wallet = await response.json();

      await db.insert(wallets).values({
        userId,
        address: wallet.address,
        walletType: "autonomous",
      });

      return new Response(JSON.stringify({ message: "Wallet connected", address: wallet.address }), { status: 201 });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Wallet connection failed" }), { status: 500 });
    }
  }
};

// Background listener for Execution Service updates
async function startTradeListener() {
  const subscriber = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  subscriber.subscribe("ORDER_EVENTS");

  subscriber.on("message", async (channel, message) => {
    if (channel === "ORDER_EVENTS") {
      try {
        const event = JSON.parse(message);
        console.log(`[API] Updating trade ${event.tradeId} to ${event.status}`);

        await db.update(trades)
          .set({
            status: event.status,
            pnl: event.pnl
          })
          .where(eq(trades.id, event.tradeId));
      } catch (e) {
        console.error("Error processing trade event:", e);
      }
    }
  });
}

startTradeListener();
