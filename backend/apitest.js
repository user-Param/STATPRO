/**
 * Statpro API Integration Tests
 * Tests the full user flow: Signup → Signin → Connect Wallet → Trade → Verify State
 *
 * Usage:
 *   npm install node-fetch   (if not already installed)
 *   node api.test.js         (or: npx jest api.test.js if using Jest)
 *
 * Set BASE_URL to your server address before running.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// ─── Minimal test harness (no dependencies needed) ───────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`   PASS: ${message}`);
    passed++;
  } else {
    console.error(`   FAIL: ${message}`);
    failed++;
  }
}

async function test(name, fn) {
  console.log(`\n ${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`   ERROR: ${err.message}`);
    failed++;
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─── Shared state across tests ────────────────────────────────────────────────
const TEST_USER = {
  username: `trader_test_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: "password123",
};

let authToken = null;
let walletId = null;

// ─── Tests ────────────────────────────────────────────────────────────────────

await test("Step 1 — Signup: creates a new account", async () => {
  const { status, data } = await post("/signup", TEST_USER);

  assert(status === 201, `status is 201 Created (got ${status})`);
  assert(typeof data.userId !== "undefined", `response contains a userId (got: ${JSON.stringify(data)})`);
});

await test("Step 1b — Signup duplicate: rejects existing email", async () => {
  const { status } = await post("/signup", TEST_USER);
  assert(status >= 400, `duplicate signup returns 4xx (got ${status})`);
});

await test("Step 2 — Signin: returns a JWT token", async () => {
  const { status, data } = await post("/signin", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  assert(status === 200, `status is 200 OK (got ${status})`);
  assert(typeof data.token === "string" && data.token.length > 0, `response contains a non-empty token`);

  authToken = data.token; // save for subsequent tests
});

await test("Step 2b — Signin with wrong password: rejected", async () => {
  const { status } = await post("/signin", {
    email: TEST_USER.email,
    password: "wrong_password",
  });
  assert(status === 401 || status === 403 || status === 400, `wrong password returns 4xx (got ${status})`);
});

await test("Step 3 — Auth guard: protected routes reject missing token", async () => {
  const { status } = await get("/profile"); // no token
  assert(status === 401 || status === 403, `no token → 401/403 (got ${status})`);
});

await test("Step 4 — Connect Wallet: creates a wallet for the user", async () => {
  assert(authToken !== null, "auth token is available from previous step");

  const { status, data } = await post("/connect-wallet", {}, authToken);

  assert(status === 201, `status is 201 Created (got ${status})`);
  assert(
    typeof data.walletAddress === "string" || typeof data.walletId !== "undefined",
    `response contains a walletAddress or walletId (got: ${JSON.stringify(data)})`
  );

  walletId = data.walletId || 1; // fall back to 1 as per the docs
});

await test("Step 5 — Place Trade: executes a BUY market order", async () => {
  assert(authToken !== null, "auth token is available");
  assert(walletId !== null, "walletId is available");

  const { status, data } = await post(
    "/trade",
    {
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      amount: "0.01",
      price: "65000",
      walletId,
    },
    authToken
  );

  assert(status === 201, `status is 201 Created (got ${status})`);
  assert(typeof data.tradeId !== "undefined", `response contains a tradeId (got: ${JSON.stringify(data)})`);
  assert(typeof data.txHash !== "undefined", `response contains a txHash (got: ${JSON.stringify(data)})`);
});

await test("Step 5b — Place Trade without auth: rejected", async () => {
  const { status } = await post("/trade", {
    symbol: "BTCUSD",
    side: "BUY",
    type: "MARKET",
    amount: "0.01",
    price: "65000",
    walletId: 1,
  }); // no token

  assert(status === 401 || status === 403, `unauthenticated trade → 401/403 (got ${status})`);
});

await test("Step 5c — Place Trade with missing fields: rejected", async () => {
  const { status } = await post("/trade", { symbol: "BTCUSD" }, authToken); // incomplete body
  assert(status >= 400, `incomplete trade body → 4xx (got ${status})`);
});

await test("Step 6a — GET /profile: returns user profile", async () => {
  const { status, data } = await get("/profile", authToken);

  assert(status === 200, `status is 200 OK (got ${status})`);
  assert(
    data.username === TEST_USER.username || data.email === TEST_USER.email,
    `profile matches the signed-up user (got: ${JSON.stringify(data)})`
  );
});

await test("Step 6b — GET /balance: returns wallet balance", async () => {
  const { status, data } = await get("/balance", authToken);

  assert(status === 200, `status is 200 OK (got ${status})`);
  assert(typeof data.balance !== "undefined", `response contains a balance field (got: ${JSON.stringify(data)})`);
});

await test("Step 6c — GET /history: returns trade history with at least one entry", async () => {
  const { status, data } = await get("/history", authToken);

  assert(status === 200, `status is 200 OK (got ${status})`);

  const trades = Array.isArray(data) ? data : data.trades || data.history || [];
  assert(trades.length > 0, `history contains at least one trade (got ${trades.length} entries)`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log(" All tests passed!");
} else {
  console.log("  Some tests failed. Check the output above.");
  process.exit(1);
}