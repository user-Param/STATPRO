import { SignJWT, jwtVerify } from "jose";
import { db } from "./client";
import { users, profiles } from "./schema";
import { eq } from "drizzle-orm";
import { safeParseJson, jsonResponse, errorResponse } from "./utils";
import { logger } from "./logger";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "secret-key-for-dev";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

async function createToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(encodedSecret);
}

function userPayload(user: { id: number; username: string; email: string }) {
  return { id: user.id, username: user.username, email: user.email };
}

export const auth = {
  async signup(req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return errorResponse("Missing body", 400);
      const { username, email, password } = body;
      logger.warn("Auth", `Attempting signup for user: ${username} (${email})`);

      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        logger.warn("Auth", `Signup failed: User ${email} already exists`);
        return errorResponse("User already exists", 400);
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [newUser] = await db.insert(users).values({
        username,
        email,
        passwordHash,
      }).returning();

      await db.insert(profiles).values({
        userId: newUser.id,
        bio: "",
        avatarUrl: ""
      });

      const token = await createToken(newUser.id);

      logger.info("Auth", `User created successfully: ID ${newUser.id}`);
      return jsonResponse({ token, user: userPayload(newUser) }, 201);
    } catch (e) {
      logger.error("Auth Error", "Signup error:", e);
      return errorResponse("Invalid request", 400, e instanceof Error ? e.message : String(e));
    }
  },

  async signin(req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return errorResponse("Missing body", 400);
      const { email, password } = body;
      logger.warn("Auth", `Attempting signin for: ${email}`);

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        logger.warn("Auth", `Signin failed: Invalid credentials for ${email}`);
        return errorResponse("Invalid credentials", 401);
      }

      const token = await createToken(user.id);

      logger.info("Auth", `Signin successful for user ID: ${user.id}`);
      return jsonResponse({ token, user: userPayload(user) }, 200);
    } catch (e) {
      logger.error("Auth Error", "Signin failed:", e);
      return errorResponse("Authentication failed", 401);
    }
  },

  async verifyJwt(req: Request, handler: (userId: number) => Promise<Response>) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const token = authHeader.split(" ")[1];
    try {
      const { payload } = await jwtVerify(token, encodedSecret);
      const userId = payload.userId as number;
      return await handler(userId);
    } catch (e) {
      return errorResponse("Invalid token", 401);
    }
  }
};
