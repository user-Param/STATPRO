import { SignJWT, jwtVerify } from "jose";
import { db } from "./client";
import { users, profiles } from "./schema";
import { eq } from "drizzle-orm";
import { safeParseJson, validateEmail, validatePassword, validateUsername, sanitizeString } from "./utils";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Refusing to start with an insecure default.");
}
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

export const auth = {
  async signup(req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return new Response(JSON.stringify({ error: "Missing body" }), { status: 400 });
      const { username, email, password } = body;

      const emailErr = validateEmail(email);
      if (emailErr) return new Response(JSON.stringify({ error: emailErr }), { status: 400 });
      const usernameErr = validateUsername(username);
      if (usernameErr) return new Response(JSON.stringify({ error: usernameErr }), { status: 400 });
      const passwordErr = validatePassword(password);
      if (passwordErr) return new Response(JSON.stringify({ error: passwordErr }), { status: 400 });

      const sanitizedUsername = sanitizeString(username);
      const sanitizedEmail = email.toLowerCase().trim();

      console.log(`\x1b[33m[Auth]\x1b[0m Attempting signup for user: ${sanitizedUsername}`);

      // Check if user exists
      const existing = await db.select().from(users).where(eq(users.email, sanitizedEmail)).limit(1);
      if (existing.length > 0) {
        console.warn(`\x1b[33m[Auth]\x1b[0m Signup failed: User ${email} already exists`);
        return new Response(JSON.stringify({ error: "User already exists" }), { status: 400 });
      }

      // Hash password using bcryptjs
      const passwordHash = await bcrypt.hash(password, 10);

      const [newUser] = await db.insert(users).values({
        username: sanitizedUsername,
        email: sanitizedEmail,
        passwordHash,
      }).returning();

      // Create a default profile for the new user
      await db.insert(profiles).values({
        userId: newUser.id,
        bio: "",
        avatarUrl: ""
      });

      // Create JWT token for the new user
      const token = await new SignJWT({ userId: newUser.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(encodedSecret);

      console.log(`\x1b[32m[Auth]\x1b[0m User created successfully: ID ${newUser.id}`);
      return new Response(JSON.stringify({
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email
        }
      }), { status: 201 });
    } catch (e) {
      console.error("\x1b[31m[Auth Error]\x1b[0m Signup error:", e);
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
    }
  },

  async signin(req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return new Response(JSON.stringify({ error: "Missing body" }), { status: 400 });
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400 });
      }
      console.log(`\x1b[33m[Auth]\x1b[0m Attempting signin`);

      const sanitizedEmail = email.toLowerCase().trim();
      const [user] = await db.select().from(users).where(eq(users.email, sanitizedEmail)).limit(1);
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        console.warn(`\x1b[33m[Auth]\x1b[0m Signin failed: Invalid credentials`);
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
      }

      const token = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(encodedSecret);

      console.log(`\x1b[32m[Auth]\x1b[0m Signin successful for user ID: ${user.id}`);
      return new Response(JSON.stringify({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      }), { status: 200 });
    } catch (e) {
      console.error("\x1b[31m[Auth Error]\x1b[0m Signin failed:", e);
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
