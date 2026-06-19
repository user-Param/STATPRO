import { test, expect, describe, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks – comprehensive schema mock to avoid cross-file conflicts
// ---------------------------------------------------------------------------
const mockSelectFrom = mock(() => ({
  where: mock(() => Promise.resolve([
    { id: 1, symbol: "ETH", side: "BUY", amount: "1.0", status: "FILLED" },
  ])),
}));

const mockSelect = mock(() => ({
  from: mockSelectFrom,
}));

const mockInsertReturning = mock(() =>
  Promise.resolve([{ id: 10, userId: 1, symbol: "ETH", side: "BUY", status: "PENDING" }])
);

const mockInsert = mock(() => ({
  values: mock(() => ({
    returning: mockInsertReturning,
  })),
}));

const mockUpdate = mock(() => ({
  set: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}));

const mockDb = { select: mockSelect, insert: mockInsert, update: mockUpdate };

const mockPublish = mock(() => Promise.resolve());
const mockSubscribe = mock();
const mockOn = mock();
const mockUnsubscribe = mock();

mock.module("../client", () => ({ db: mockDb }));
mock.module("../schema", () => ({
  users: "users_table",
  profiles: "profiles_table",
  wallets: "wallets_table",
  balances: "balances_table",
  trades: "trades_table",
}));
mock.module("../redis", () => ({
  redisPub: { publish: mockPublish },
  redisSub: { subscribe: mockSubscribe, on: mockOn, off: mock(), unsubscribe: mockUnsubscribe },
  CHANNELS: {
    ENGINE_RISK_CHECK: "engine:risk_check:req",
    EXECUTION_TRIGGER: "execution:trade:req",
    DATAFEED_SUBSCRIPTION: "datafeed:subscribe:req",
    ENGINE_RESPONSE: "engine:risk_check:res",
    EXECUTION_STATUS: "execution:trade:status",
    DATAFEED_UPDATES: "datafeed:price:update",
    ORDER_EVENTS: "ORDER_EVENTS",
  },
  requestResponse: mock(() => Promise.resolve({ allowed: true })),
}));

const { trade } = await import("../trade");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown> | null): Request {
  return new Request("http://localhost/trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------
describe("trade.createOrder", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertReturning.mockClear();
    mockPublish.mockClear();
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request("http://localhost/trade", { method: "POST", body: "" });
    const res = await trade.createOrder(1, req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing body");
  });

  test("returns 201 with tradeId on successful order", async () => {
    const req = makeRequest({
      symbol: "ETH",
      side: "BUY",
      type: "MARKET",
      amount: 1.5,
      price: 3000,
      walletId: 1,
    });

    const res = await trade.createOrder(1, req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.message).toBe("Order orchestrated");
    expect(body.tradeId).toBeDefined();
    expect(body.txHash).toBeDefined();
  });

  test("publishes execution trigger to Redis", async () => {
    const req = makeRequest({
      symbol: "LINK",
      side: "SELL",
      type: "LIMIT",
      amount: 10,
      price: 25,
      walletId: 2,
    });

    await trade.createOrder(5, req);

    expect(mockPublish).toHaveBeenCalled();
    const [channel, payload] = mockPublish.mock.calls[mockPublish.mock.calls.length - 1];
    expect(channel).toBe("execution:trade:req");
    const data = JSON.parse(payload);
    expect(data.symbol).toBe("LINK");
    expect(data.side).toBe("SELL");
    expect(data.userId).toBe(5);
  });

  test("returns 500 when db insert throws", async () => {
    mockInsert.mockImplementationOnce(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error("DB down")),
      }),
    }));

    const req = makeRequest({
      symbol: "ETH",
      side: "BUY",
      type: "MARKET",
      amount: 1,
      price: 3000,
      walletId: 1,
    });
    const res = await trade.createOrder(1, req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Order orchestration failed");
  });
});

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------
describe("trade.getHistory", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockSelectFrom.mockClear();
  });

  test("returns 200 with trade array", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: 1, symbol: "ETH", side: "BUY", status: "FILLED" },
            { id: 2, symbol: "LINK", side: "SELL", status: "PENDING" },
          ]),
      }),
    } as any);

    const res = await trade.getHistory(1);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].symbol).toBe("ETH");
    expect(body[1].symbol).toBe("LINK");
  });

  test("returns empty array when user has no trades", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    } as any);

    const res = await trade.getHistory(999);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("returns 500 when db throws", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.reject(new Error("DB error")),
      }),
    } as any);

    const res = await trade.getHistory(1);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch history");
  });
});

// ---------------------------------------------------------------------------
// connectWallet
// ---------------------------------------------------------------------------
describe("trade.connectWallet", () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  test("returns 201 with wallet address", async () => {
    mockInsert.mockReturnValueOnce({
      values: () => Promise.resolve(),
    } as any);

    const res = await trade.connectWallet(1);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.message).toBe("Wallet connected");
    expect(body.address).toBeDefined();
    expect(body.address.startsWith("0x")).toBe(true);
  });

  test("returns 500 when db insert fails", async () => {
    mockInsert.mockReturnValueOnce({
      values: () => Promise.reject(new Error("Duplicate address")),
    } as any);

    const res = await trade.connectWallet(1);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Wallet connection failed");
  });
});
