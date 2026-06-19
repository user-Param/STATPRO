import { test, expect, describe, mock, beforeEach } from "bun:test";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Mocks – isolate auth logic from the real database
// All schema exports must be present so other test files don't break the cache.
// ---------------------------------------------------------------------------
const mockSelect = mock(() => ({
  from: mock(() => ({
    where: mock(() => ({
      limit: mock(() => Promise.resolve([])),
    })),
  })),
}));

const mockInsertReturning = mock(() =>
  Promise.resolve([{ id: 1, username: "alice", email: "alice@example.com" }])
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

mock.module("../client", () => ({ db: mockDb }));
mock.module("../schema", () => ({
  users: "users_table",
  profiles: "profiles_table",
  wallets: "wallets_table",
  balances: "balances_table",
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

const { auth } = await import("../auth");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const JWT_SECRET = "secret-key-for-dev";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

function makeRequest(body: Record<string, unknown> | null): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
}

// ---------------------------------------------------------------------------
// signup
// ---------------------------------------------------------------------------
describe("auth.signup", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockInsertReturning.mockClear();
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request("http://localhost/signup", { method: "POST", body: "" });
    const res = await auth.signup(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing body");
  });

  test("returns 400 when user already exists", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 99, email: "alice@example.com" }]),
        }),
      }),
    } as any);

    const req = makeRequest({ username: "alice", email: "alice@example.com", password: "pass123" });
    const res = await auth.signup(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("User already exists");
  });

  test("creates user and returns 201 with token on success", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    } as any);

    let insertCallCount = 0;
    const insertValues = mock(() => ({
      returning: () => Promise.resolve([{ id: 1, username: "bob", email: "bob@example.com" }]),
    }));
    const insertValuesProfile = mock(() => Promise.resolve());

    mockInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return { values: insertValues } as any;
      }
      return { values: () => insertValuesProfile() } as any;
    });

    const req = makeRequest({ username: "bob", email: "bob@example.com", password: "secret" });
    const res = await auth.signup(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("bob");
    expect(body.user.email).toBe("bob@example.com");

    insertCallCount = 0;
  });
});

// ---------------------------------------------------------------------------
// signin
// ---------------------------------------------------------------------------
describe("auth.signin", () => {
  beforeEach(() => {
    mockSelect.mockClear();
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request("http://localhost/signin", { method: "POST", body: "" });
    const res = await auth.signin(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing body");
  });

  test("returns 401 for non-existent user", async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    } as any);

    const req = makeRequest({ email: "nobody@example.com", password: "x" });
    const res = await auth.signin(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid credentials");
  });

  test("returns 401 for wrong password", async () => {
    const hash = await bcrypt.hash("correct-password", 10);
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ id: 1, username: "alice", email: "alice@example.com", passwordHash: hash }]),
        }),
      }),
    } as any);

    const req = makeRequest({ email: "alice@example.com", password: "wrong-password" });
    const res = await auth.signin(req);
    expect(res.status).toBe(401);
  });

  test("returns 200 with token for valid credentials", async () => {
    const hash = await bcrypt.hash("correct-password", 10);
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ id: 5, username: "alice", email: "alice@example.com", passwordHash: hash }]),
        }),
      }),
    } as any);

    const req = makeRequest({ email: "alice@example.com", password: "correct-password" });
    const res = await auth.signin(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(5);
    expect(body.user.email).toBe("alice@example.com");
  });
});

// ---------------------------------------------------------------------------
// verifyJwt
// ---------------------------------------------------------------------------
describe("auth.verifyJwt", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const req = new Request("http://localhost/test", { method: "GET" });
    const handler = mock(() => Promise.resolve(new Response("ok")));
    const res = await auth.verifyJwt(req, handler);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  test("returns 401 when Authorization header does not start with Bearer", async () => {
    const req = new Request("http://localhost/test", {
      method: "GET",
      headers: { Authorization: "Basic abc123" },
    });
    const handler = mock(() => Promise.resolve(new Response("ok")));
    const res = await auth.verifyJwt(req, handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("returns 401 for an invalid/expired token", async () => {
    const req = new Request("http://localhost/test", {
      method: "GET",
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    const handler = mock(() => Promise.resolve(new Response("ok")));
    const res = await auth.verifyJwt(req, handler);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  test("calls handler with userId for a valid token", async () => {
    const token = await new SignJWT({ userId: 42 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(encodedSecret);

    const handlerResponse = new Response(JSON.stringify({ data: "ok" }), { status: 200 });
    const handler = mock(() => Promise.resolve(handlerResponse));

    const req = new Request("http://localhost/test", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await auth.verifyJwt(req, handler);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(42);
  });

  test("returns 401 for token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(wrongSecret);

    const handler = mock(() => Promise.resolve(new Response("ok")));
    const req = new Request("http://localhost/test", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await auth.verifyJwt(req, handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
