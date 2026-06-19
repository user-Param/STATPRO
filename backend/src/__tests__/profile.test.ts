import { test, expect, describe, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks – comprehensive to avoid cross-file conflicts
// ---------------------------------------------------------------------------
const mockLimit = mock(() => Promise.resolve([{
  id: 1,
  userId: 10,
  bio: "quant trader",
  avatarUrl: "https://img.example.com/avatar.png",
  username: "alice",
  email: "alice@example.com",
  status: "Active",
}]));

const mockWhere = mock(() => ({ limit: mockLimit }));
const mockInnerJoin = mock(() => ({ where: mockWhere }));
const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockUpdateSet = mock(() => ({
  where: mock(() => Promise.resolve()),
}));

const mockUpdate = mock(() => ({
  set: mockUpdateSet,
}));

const mockInsert = mock(() => ({
  values: mock(() => ({
    returning: mock(() => Promise.resolve([])),
  })),
}));

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
};

mock.module("../client", () => ({ db: mockDb }));
mock.module("../schema", () => ({
  users: { id: "u.id", username: "u.username", email: "u.email" },
  profiles: { id: "p.id", userId: "p.user_id", bio: "p.bio", avatarUrl: "p.avatar_url" },
  wallets: { id: "w.id", userId: "w.user_id" },
  balances: { walletId: "b.wallet_id" },
  trades: "trades_table",
}));
mock.module("../redis", () => ({
  redisPub: { publish: mock(() => Promise.resolve()) },
  redisSub: { subscribe: mock(), on: mock(), off: mock(), unsubscribe: mock() },
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

const { profile } = await import("../profile");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown> | null): Request {
  return new Request("http://localhost/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
}

// ---------------------------------------------------------------------------
// profile.get
// ---------------------------------------------------------------------------
describe("profile.get", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockLimit.mockClear();
  });

  test("returns 200 with profile data when found", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{
              id: 1,
              userId: 10,
              bio: "quant trader",
              avatarUrl: "https://img.example.com/avatar.png",
              username: "alice",
              email: "alice@example.com",
              status: "Active",
            }]),
          }),
        }),
      }),
    } as any);

    const res = await profile.get(10);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.username).toBe("alice");
    expect(body.bio).toBe("quant trader");
    expect(body.email).toBe("alice@example.com");
  });

  test("returns 404 when profile is not found", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any);

    const res = await profile.get(999);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.message).toBe("Profile not found");
  });
});

// ---------------------------------------------------------------------------
// profile.update
// ---------------------------------------------------------------------------
describe("profile.update", () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request("http://localhost/profile", { method: "POST", body: "" });
    const res = await profile.update(1, req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing body");
  });

  test("returns 200 on successful update", async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    } as any);

    const req = makeRequest({ bio: "new bio", avatarUrl: "https://img.example.com/new.png" });
    const res = await profile.update(1, req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Profile updated");
  });

  test("returns 400 when db update throws", async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.reject(new Error("DB error")),
      }),
    } as any);

    const req = makeRequest({ bio: "x" });
    const res = await profile.update(1, req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Update failed");
  });

  test("handles partial update (bio only)", async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    } as any);

    const req = makeRequest({ bio: "updated bio" });
    const res = await profile.update(1, req);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// profile.getBalances
// ---------------------------------------------------------------------------
describe("profile.getBalances", () => {
  beforeEach(() => {
    mockSelect.mockClear();
  });

  test("returns 200 with balance data", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () =>
            Promise.resolve([
              { asset: "ETH", amount: "10.5" },
              { asset: "BTC", amount: "0.5" },
            ]),
        }),
      }),
    } as any);

    const res = await profile.getBalances(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].asset).toBe("ETH");
  });

  test("returns empty array when no balances exist", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as any);

    const res = await profile.getBalances(999);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("returns 500 when db throws", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.reject(new Error("DB error")),
        }),
      }),
    } as any);

    const res = await profile.getBalances(1);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch balances");
  });
});
