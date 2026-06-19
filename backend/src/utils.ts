export const jsonResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export const safeParseJson = async (req: Request) => {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON in request body");
  }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): string | null {
  if (typeof email !== "string" || !email.trim()) return "Email is required";
  if (email.length > 100) return "Email must be under 100 characters";
  if (!EMAIL_RE.test(email)) return "Invalid email format";
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be under 128 characters";
  return null;
}

export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string" || !username.trim()) return "Username is required";
  if (username.length < 3) return "Username must be at least 3 characters";
  if (username.length > 50) return "Username must be under 50 characters";
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return "Username may only contain letters, numbers, hyphens, and underscores";
  return null;
}

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>&"']/g, "");
}

export function validateTradeInput(body: any): string | null {
  if (!body) return "Request body is required";
  const { symbol, side, type, amount, price } = body;
  if (typeof symbol !== "string" || !symbol.trim()) return "Symbol is required";
  if (symbol.length > 20) return "Symbol too long";
  if (!["BUY", "SELL"].includes(side)) return "Side must be BUY or SELL";
  if (!["MARKET", "LIMIT"].includes(type)) return "Type must be MARKET or LIMIT";
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return "Amount must be a positive number";
  const prc = Number(price);
  if (!Number.isFinite(prc) || prc <= 0) return "Price must be a positive number";
  return null;
}
