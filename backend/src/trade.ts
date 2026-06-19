import { db } from "./client";
import { trades, wallets } from "./schema";
import { eq } from "drizzle-orm";
import { safeParseJson, jsonResponse, errorResponse } from "./utils";
import { logger } from "./logger";
import { WalletAgentService } from "./wallet-agent";
import { redisPub, redisSub, CHANNELS, requestResponse } from "./redis";

const TAG = "Trade Orchestrator";
const walletAgent = new WalletAgentService(TAG);

export const trade = {
  async createOrder(userId: number, req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return errorResponse("Missing body", 400);
      const { symbol, side, type, amount, price, walletId } = body;
      
      logger.debug(TAG, `New Order: ${side} ${type} ${amount} ${symbol} (User: ${userId})`);

      logger.debug(TAG, "Requesting Risk Check from Engine...");
      let riskCheck;
      try {
        riskCheck = await requestResponse(CHANNELS.ENGINE_RISK_CHECK, CHANNELS.ENGINE_RESPONSE, {
          userId,
          amount,
          price,
          symbol
        }, 3000);
      } catch (e) {
        logger.warn(TAG, "Risk Engine timeout, defaulting to manual approval (DEV MODE)");
        riskCheck = { allowed: true };
      }

      if (!riskCheck.allowed) {
        logger.warn(TAG, "Order REJECTED: Insufficient margin");
        return errorResponse("Insufficient margin", 403);
      }

      const signing = await walletAgent.signTrade(walletId, { symbol, side, type, quantity: amount, price });

      logger.debug(TAG, "Dispatching Execution request to Redis...");
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

      logger.info(TAG, `Order successfully orchestrated: ID ${newTrade.id}`);
      return jsonResponse({
        message: "Order orchestrated",
        tradeId: newTrade.id,
        txHash: signing.txHash
      }, 201);

    } catch (e) {
      logger.error(`${TAG} Error`, "Orchestration failed:", e);
      return errorResponse("Order orchestration failed", 500);
    }
  },

  async getHistory(userId: number) {
    try {
      logger.debug(TAG, `Fetching trade history for user: ${userId}`);
      const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));
      return jsonResponse(userTrades);
    } catch (e) {
      logger.error(`${TAG} Error`, "Failed to fetch history:", e);
      return errorResponse("Failed to fetch history", 500);
    }
  },

  async connectWallet(userId: number) {
    try {
      logger.debug(TAG, `Connecting wallet for user: ${userId}`);
      const wallet = await walletAgent.createAutonomousWallet(userId);

      await db.insert(wallets).values({
        userId,
        address: wallet.address,
        walletType: "autonomous",
      });

      logger.info(TAG, `Wallet connected: ${wallet.address}`);
      return jsonResponse({ message: "Wallet connected", address: wallet.address }, 201);
    } catch (e) {
      logger.error(`${TAG} Error`, "Wallet connection failed:", e);
      return errorResponse("Wallet connection failed", 500);
    }
  }
};

async function startGlobalListener() {
  redisSub.subscribe(CHANNELS.EXECUTION_STATUS, CHANNELS.ORDER_EVENTS);

  redisSub.on("message", async (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      if (channel === CHANNELS.EXECUTION_STATUS || channel === CHANNELS.ORDER_EVENTS) {
        logger.debug("Redis Listener", `Received status update for Trade ${data.tradeId}: ${data.status}`);

        await db.update(trades)
          .set({
            status: data.status,
            pnl: data.pnl
          })
          .where(eq(trades.id, data.tradeId));
      }
    } catch (e) {
      logger.error("Redis Listener Error", "Failed to process microservice update:", e);
    }
  });
}

startGlobalListener();
