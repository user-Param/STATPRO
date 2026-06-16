import express from "express";
import { auth } from "./src/auth";
import { trade } from "./src/trade";
import { profile } from "./src/profile";

const app = express();
app.use(express.json()); // Parse JSON bodies
const port = process.env.PORT || 3000;

/**
 * Helper to convert Express req to Web Request
 * This allows us to keep the existing business logic in src/
 * without rewriting every handler to use (req, res).
 */
function createWebRequest(req: express.Request) {
  return new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: JSON.stringify(req.body),
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

// --- Auth Routes ---
app.post("/signup", async (req, res) => {
  const webReq = createWebRequest(req);
  const response = await auth.signup(webReq);
  await handleResponse(res, response);
});

app.post("/signin", async (req, res) => {
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

app.listen(port, () => {
  console.log(`\x1b[32m[Server]\x1b[0m Node.js API Layer running on port ${port}`);
});
