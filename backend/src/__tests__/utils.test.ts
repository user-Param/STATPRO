import { test, expect, describe } from "bun:test";
import { jsonResponse, safeParseJson } from "../utils";

describe("jsonResponse", () => {
  test("returns a Response with JSON content-type", async () => {
    const res = jsonResponse({ ok: true });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  test("defaults to status 200", () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
  });

  test("accepts a custom status code", () => {
    const res = jsonResponse({ error: "not found" }, 404);
    expect(res.status).toBe(404);
  });

  test("serialises the data as JSON in the body", async () => {
    const data = { count: 42, items: ["a", "b"] };
    const res = jsonResponse(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });

  test("handles empty object", async () => {
    const res = jsonResponse({});
    const body = await res.json();
    expect(body).toEqual({});
  });

  test("handles null data", async () => {
    const res = jsonResponse(null);
    const body = await res.json();
    expect(body).toBeNull();
  });

  test("handles array data", async () => {
    const res = jsonResponse([1, 2, 3]);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });

  test("handles nested objects", async () => {
    const data = { user: { name: "alice", settings: { theme: "dark" } } };
    const res = jsonResponse(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });
});

describe("safeParseJson", () => {
  function makeRequest(body: string | null, contentType = "application/json"): Request {
    return new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  }

  test("parses valid JSON body", async () => {
    const req = makeRequest(JSON.stringify({ email: "a@b.com" }));
    const result = await safeParseJson(req);
    expect(result).toEqual({ email: "a@b.com" });
  });

  test("returns null for empty body", async () => {
    const req = makeRequest("");
    const result = await safeParseJson(req);
    expect(result).toBeNull();
  });

  test("returns null for null body", async () => {
    const req = new Request("http://localhost/test", { method: "GET" });
    const result = await safeParseJson(req);
    expect(result).toBeNull();
  });

  test("throws on malformed JSON", async () => {
    const req = makeRequest("{bad json");
    await expect(safeParseJson(req)).rejects.toThrow("Invalid JSON");
  });

  test("parses JSON arrays", async () => {
    const req = makeRequest(JSON.stringify([1, 2, 3]));
    const result = await safeParseJson(req);
    expect(result).toEqual([1, 2, 3]);
  });

  test("parses JSON primitives (string)", async () => {
    const req = makeRequest(JSON.stringify("hello"));
    const result = await safeParseJson(req);
    expect(result).toBe("hello");
  });

  test("parses JSON primitives (number)", async () => {
    const req = makeRequest(JSON.stringify(42));
    const result = await safeParseJson(req);
    expect(result).toBe(42);
  });

  test("parses nested objects", async () => {
    const data = { user: { id: 1, trades: [{ symbol: "ETH" }] } };
    const req = makeRequest(JSON.stringify(data));
    const result = await safeParseJson(req);
    expect(result).toEqual(data);
  });
});
