import { auth } from "./src/auth";
import { profile } from "./src/profile";
import { trade } from "./src/trade";
import { jsonResponse } from "./src/utils";

console.log("Stashpro Trading API starting...");

const logger = async (req: Request, handler: (req: Request) => Promise<Response>) => {
  const start = Date.now();
  const method = req.method;
  const url = new URL(req.url).pathname;

  console.log(`\x1b[36m[API Request]\x1b[0m ${method} ${url}`);

  try {
    const response = await handler(req);
    const duration = Date.now() - start;
    const statusColor = response.status >= 400 ? "\x1b[31m" : "\x1b[32m";
    console.log(`${statusColor}[API Response]\x1b[0m ${method} ${url} - ${response.status} (${duration}ms)`);
    
    // If it's already a Response with Content-Type, return it
    if (response.headers.get("Content-Type") === "application/json") {
      return response;
    }

    // Otherwise, ensure it has the header
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (err) {
    const duration = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[API Error]\x1b[0m ${method} ${url} - 500 (${duration}ms): ${errorMessage}`);
    
    // Check if it's a JSON parse error (usually 400, not 500)
    const status = errorMessage.includes("Invalid JSON") ? 400 : 500;
    return jsonResponse({ error: status === 400 ? "Bad Request" : "Internal Server Error", details: errorMessage }, status);
  }
};

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url).pathname;
    const method = req.method;

    const routes: Record<string, Record<string, (req: Request) => Promise<Response>>> = {
      "/api/auth/signup": {
        POST: (req) => auth.signup(req),
      },
      "/api/auth/signin": {
        POST: (req) => auth.signin(req),
      },
      "/api/profile": {
        GET: (req) => auth.verifyJwt(req, (userId) => profile.get(userId)),
        PATCH: (req) => auth.verifyJwt(req, (userId) => profile.update(userId, req)),
      },
      "/api/profile/balances": {
        GET: (req) => auth.verifyJwt(req, (userId) => profile.getBalances(userId)),
      },
      "/api/trade/order": {
        POST: (req) => auth.verifyJwt(req, (userId) => trade.createOrder(userId, req)),
      },
      "/api/trade/history": {
        GET: (req) => auth.verifyJwt(req, (userId) => trade.getHistory(userId)),
      },
      "/api/wallet/connect": {
        POST: (req) => auth.verifyJwt(req, (userId) => trade.connectWallet(userId)),
      },
    };

    const route = routes[url];
    if (route && route[method]) {
      return logger(req, route[method]);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  },
  error: (req, err) => {
    console.error(`\x1b[31m[Server Error]\x1b[0m ${req.method} ${req.url}:`, err);
    return jsonResponse({ error: "Internal Server Error" }, 500);
  },
});

console.log("Listening on http://localhost:3000");
