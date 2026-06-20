import express from "express";
import cors from "cors";
import { auth } from "./src/auth";
import { trade } from "./src/trade";
import { profile } from "./src/profile";

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies
const port = process.env.PORT || 4000;

/**
 * Helper to convert Express req to Web Request
 * This allows us to keep the existing business logic in src/
 * without rewriting every handler to use (req, res).
 */
function createWebRequest(req: express.Request) {
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(req.method);
  return new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: isBodyMethod ? JSON.stringify(req.body) : undefined,
  });
}

/**
 * Helper to handle Web Response in Express
 */
async function handleResponse(res: express.Response, webResponse: Response) {
  const text = await webResponse.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  res.status(webResponse.status).json(json);
}

/**
 * Wraps an async Express handler to catch unhandled rejections and return 500
 * instead of crashing the process.
 */
function asyncHandler(fn: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response) => {
    fn(req, res).catch((err) => {
      console.error(`\x1b[31m[Server]\x1b[0m Unhandled route error on ${req.method} ${req.path}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
}

// --- Auth Routes ---
app.post("/signup", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.signup(webReq);
  await handleResponse(res, response);
}));

app.post("/signin", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.signin(webReq);
  await handleResponse(res, response);
}));

// --- Trade Routes (Protected) ---
app.post("/trade", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.createOrder(userId, webReq);
  });
  await handleResponse(res, response);
}));

app.get("/history", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.getHistory(userId);
  });
  await handleResponse(res, response);
}));

app.post("/connect-wallet", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.connectWallet(userId);
  });
  await handleResponse(res, response);
}));

// --- Profile Routes (Protected) ---
app.get("/profile", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.get(userId);
  });
  await handleResponse(res, response);
}));

app.post("/profile", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.update(userId, webReq);
  });
  await handleResponse(res, response);
}));

app.get("/balance", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.getBalances(userId);
  });
  await handleResponse(res, response);
}));

// Strategy control endpoint (protected)
app.post("/strategy/toggle", asyncHandler(async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    console.log(`[Strategy] User ${userId} toggled strategy:`, req.body);
    return new Response(JSON.stringify({ success: true, message: 'Strategy toggle acknowledged' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await handleResponse(res, response);
}));

// Global unhandled rejection handler to prevent silent crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("\x1b[31m[Server]\x1b[0m Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[Server]\x1b[0m Uncaught Exception:", err);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`\x1b[32m[Server]\x1b[0m Node.js API Layer running on port ${port}`);
});
