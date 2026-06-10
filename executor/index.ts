import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

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
    console.log(`[Executor] Signing trade for wallet ${walletId} via Agent Kit...`);
    // This is where the actual Trust Wallet Agent Kit SDK would be used
    return {
      signature: "0x_signed_payload_from_agent_kit",
      txHash: `0x${Math.random().toString(16).substring(2, 32)}`
    };
  }
}

const walletAgent = new WalletAgentService();

console.log("🚀 Execution Service starting...");

Bun.serve({
  port: 4000, // Different port from API (3000)
  routes: {
    "/execute": {
      POST: async (req) => {
        try {
          const body = await req.json();
          const { userId, walletId, symbol, side, type, amount, price } = body;

          console.log(`[Executor] Received execution request for ${symbol} ${side}`);

          // 1. Sign the trade using the Agent Kit
          const signing = await walletAgent.signTrade(walletId, { symbol, side, type, amount, price });

          // 2. Broadcast to Blockchain (Mocked)
          console.log(`[Executor] Broadcasting tx ${signing.txHash} to blockchain...`);

          // Simulate blockchain delay
          setTimeout(async () => {
            console.log(`[Executor] Trade ${signing.txHash} confirmed on-chain.`);

            // 3. Signal back to the system via Redis
            const event = {
              tradeId: body.tradeId, // The ID created by the API layer
              status: "FILLED",
              pnl: (Math.random() * 10).toFixed(2),
              txHash: signing.txHash
            };
            await redis.publish("ORDER_EVENTS", JSON.stringify(event));
          }, 2000);

          return new Response(JSON.stringify({
            success: true,
            txHash: signing.txHash,
            message: "Transaction broadcasted"
          }), { status: 200 });

        } catch (e) {
          console.error("[Executor] Execution error:", e);
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

console.log("Executor listening on http://localhost:4000");
