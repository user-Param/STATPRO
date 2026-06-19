import { test, expect, describe, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock ioredis before importing the module under test.
// Also mock schema and client for cross-file compatibility.
// ---------------------------------------------------------------------------
let publishFn = mock(() => Promise.resolve());
let subscribeFn = mock(() => Promise.resolve());
let unsubscribeFn = mock(() => Promise.resolve());
let onFn = mock();
let offFn = mock();

mock.module("ioredis", () => {
  class FakeRedis {
    publish = publishFn;
    subscribe = subscribeFn;
    unsubscribe = unsubscribeFn;
    on = onFn;
    off = offFn;
  }
  return { default: FakeRedis };
});

mock.module("../client", () => ({
  db: { select: mock(), insert: mock(), update: mock() },
}));
mock.module("../schema", () => ({
  users: "users_table",
  profiles: "profiles_table",
  wallets: "wallets_table",
  balances: "balances_table",
  trades: "trades_table",
}));

const { CHANNELS, requestResponse } = await import("../redis");

// ---------------------------------------------------------------------------
// CHANNELS
// ---------------------------------------------------------------------------
describe("CHANNELS", () => {
  test("defines all expected channel keys", () => {
    expect(CHANNELS.ENGINE_RISK_CHECK).toBe("engine:risk_check:req");
    expect(CHANNELS.ENGINE_RESPONSE).toBe("engine:risk_check:res");
    expect(CHANNELS.EXECUTION_TRIGGER).toBe("execution:trade:req");
    expect(CHANNELS.EXECUTION_STATUS).toBe("execution:trade:status");
    expect(CHANNELS.DATAFEED_SUBSCRIPTION).toBe("datafeed:subscribe:req");
    expect(CHANNELS.DATAFEED_UPDATES).toBe("datafeed:price:update");
    expect(CHANNELS.ORDER_EVENTS).toBe("ORDER_EVENTS");
  });

  test("has 7 channel entries", () => {
    expect(Object.keys(CHANNELS)).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// requestResponse
// ---------------------------------------------------------------------------
describe("requestResponse", () => {
  beforeEach(() => {
    publishFn.mockClear();
    subscribeFn.mockClear();
    onFn.mockClear();
    offFn.mockClear();
  });

  test("publishes request payload with a requestId", async () => {
    onFn.mockImplementation((event: string, handler: Function) => {
      if (event === "message") {
        publishFn.mockImplementation(async (channel: string, payload: string) => {
          const parsed = JSON.parse(payload);
          handler("engine:risk_check:res", JSON.stringify({
            requestId: parsed.requestId,
            allowed: true,
          }));
        });
      }
    });

    const result = await requestResponse(
      "engine:risk_check:req",
      "engine:risk_check:res",
      { userId: 1, amount: 100 },
      5000
    );

    expect(result.allowed).toBe(true);
    expect(subscribeFn).toHaveBeenCalledWith("engine:risk_check:res");
  });

  test("rejects on timeout when no response arrives", async () => {
    onFn.mockImplementation(() => {});

    await expect(
      requestResponse("req", "res", { test: true }, 50)
    ).rejects.toThrow("Timeout waiting for response on res");
  });

  test("ignores responses with non-matching requestId", async () => {
    onFn.mockImplementation((event: string, handler: Function) => {
      if (event === "message") {
        setTimeout(() => {
          handler("engine:risk_check:res", JSON.stringify({
            requestId: "wrong-id",
            allowed: false,
          }));
        }, 5);
      }
    });

    await expect(
      requestResponse("engine:risk_check:req", "engine:risk_check:res", { userId: 1 }, 100)
    ).rejects.toThrow("Timeout");
  });

  test("includes custom data fields in published payload", async () => {
    onFn.mockImplementation((event: string, handler: Function) => {
      if (event === "message") {
        publishFn.mockImplementation(async (channel: string, payload: string) => {
          const parsed = JSON.parse(payload);
          handler("res_chan", JSON.stringify({ requestId: parsed.requestId, ok: true }));
        });
      }
    });

    const data = { userId: 42, amount: 100, symbol: "ETH" };
    const result = await requestResponse("req_chan", "res_chan", data, 5000);
    expect(result.ok).toBe(true);

    const publishedPayload = JSON.parse(publishFn.mock.calls[0][1] as string);
    expect(publishedPayload.userId).toBe(42);
    expect(publishedPayload.amount).toBe(100);
    expect(publishedPayload.symbol).toBe("ETH");
    expect(publishedPayload.requestId).toBeDefined();
  });
});
