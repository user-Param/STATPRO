import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { auth } from "./src/auth";
import { trade } from "./src/trade";
import { profile } from "./src/profile";

const app = express();
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",");
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
const port = process.env.PORT || 4000;

/**
 * Helper to convert Express req to Web Request
 * This allows us to keep the existing business logic in src/
 * without rewriting every handler to use (req, res).
 */
function createWebRequest(req: express.Request) {
  const headers: Record<string, string> = {};
  if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"] as string;
  return new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers,
    body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
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

// --- Auth Routes (rate-limited) ---
app.post("/signup", authLimiter, async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.signup(webReq);
  await handleResponse(res, response);
});

app.post("/signin", authLimiter, async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.signin(webReq);
  await handleResponse(res, response);
});

// --- Trade Routes (Protected) ---
app.post("/trade", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.createOrder(userId, webReq);
  });
  await handleResponse(res, response);
});

app.get("/history", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.getHistory(userId);
  });
  await handleResponse(res, response);
});

app.post("/connect-wallet", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await trade.connectWallet(userId);
  });
  await handleResponse(res, response);
});

// --- Profile Routes (Protected) ---
app.get("/profile", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.get(userId);
  });
  await handleResponse(res, response);
});

app.post("/profile", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.update(userId, webReq);
  });
  await handleResponse(res, response);
});

app.get("/balance", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    return await profile.getBalances(userId);
  });
  await handleResponse(res, response);
});

// Strategy control endpoint (protected)
app.post("/strategy/toggle", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.verifyJwt(webReq, async (userId) => {
    // In a real implementation, we would start/stop the strategy here.
    // For now, just log and return success.
    console.log(`[Strategy] User ${userId} toggled strategy:`, req.body);
    return new Response(JSON.stringify({ success: true, message: 'Strategy toggle acknowledged' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await handleResponse(res, response);
});

app.listen(port, () => {
  console.log(`\x1b[32m[Server]\x1b[0m Node.js API Layer running on port ${port}`);
});
