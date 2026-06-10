import { SignJWT, jwtVerify } from "jose";
import { db } from "./client";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "secret-key-for-dev";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

export const auth = {
  async signup(req: Request) {
    try {
      const { username, email, password } = await req.json();

      // Check if user exists
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return new Response(JSON.stringify({ error: "User already exists" }), { status: 400 });
      }

      // Hash password using Bun's native API
      const passwordHash = await Bun.password.hash(password);

      const [newUser] = await db.insert(users).values({
        username,
        email,
        passwordHash,
      }).returning();

      return new Response(JSON.stringify({ message: "User created", userId: newUser.id }), { status: 201 });
    } catch (e) {
      console.error("Signup error:", e);
      return new Response(JSON.stringify({ error: "Invalid request", details: e instanceof Error ? e.message : String(e) }), { status: 400 });
    }
  },

  async signin(req: Request) {
    try {
      const { email, password } = await req.json();

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
      }

      const token = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(encodedSecret);

      return new Response(JSON.stringify({ token }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), { status: 401 });
    }
  },

  async verifyJwt(req: Request, handler: (userId: number) => Promise<Response>) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    try {
      const { payload } = await jwtVerify(token, encodedSecret);
      const userId = payload.userId as number;
      return await handler(userId);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
  }
};
