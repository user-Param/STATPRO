import { auth } from "./src/auth";
import { profile } from "./src/profile";
import { trade } from "./src/trade";

console.log("🚀 Stashpro Trading API starting...");

Bun.serve({
  port: 3000,
  routes: {
    // Authentication
    "/api/auth/signup": {
      POST: (req) => auth.signup(req),
    },
    "/api/auth/signin": {
      POST: (req) => auth.signin(req),
    },

    // Profile & Account
    "/api/profile": {
      GET: (req) => auth.verifyJwt(req, (userId) => profile.get(userId)),
      PATCH: (req) => auth.verifyJwt(req, (userId) => profile.update(userId, req)),
    },
    "/api/profile/balances": {
      GET: (req) => auth.verifyJwt(req, (userId) => profile.getBalances(userId)),
    },

    // Trading Orchestration
    "/api/trade/order": {
      POST: (req) => auth.verifyJwt(req, (userId) => trade.createOrder(userId, req)),
    },
    "/api/trade/history": {
      GET: (req) => auth.verifyJwt(req, (userId) => trade.getHistory(userId)),
    },
    "/api/wallet/connect": {
      POST: (req) => auth.verifyJwt(req, (userId) => trade.connectWallet(userId)),
    },
  },
  error: (req, err) => {
    console.error(`Error handling ${req.method} ${req.url}:`, err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  },
});

console.log("Listening on http://localhost:3000");
