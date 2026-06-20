import { db } from "./client";
import { profiles, balances, wallets, users } from "./schema";
import { eq, sql } from "drizzle-orm";
import { safeParseJson } from "./utils";

export const profile = {
  async get(userId: number) {
    try {
      const [userProfile] = await db
        .select({
          id: profiles.id,
          userId: profiles.userId,
          bio: profiles.bio,
          avatarUrl: profiles.avatarUrl,
          username: users.username,
          email: users.email,
          status: sql<string>`'Active'`.as('status')
        })
        .from(profiles)
        .innerJoin(users, eq(profiles.userId, users.id))
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!userProfile) {
        return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });
      }

      return new Response(JSON.stringify(userProfile), { status: 200 });
    } catch (e) {
      console.error("\x1b[31m[Profile Error]\x1b[0m Failed to fetch profile:", e);
      return new Response(JSON.stringify({ error: "Failed to fetch profile", details: e instanceof Error ? e.message : String(e) }), { status: 500 });
    }
  },

  async update(userId: number, req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return new Response(JSON.stringify({ error: "Missing body" }), { status: 400 });
      const { bio, avatarUrl } = body;

      await db.update(profiles)
        .set({ bio, avatarUrl })
        .where(eq(profiles.userId, userId));

      return new Response(JSON.stringify({ message: "Profile updated" }), { status: 200 });
    } catch (e) {
      console.error("\x1b[31m[Profile Error]\x1b[0m Failed to update profile:", e);
      return new Response(JSON.stringify({ error: "Update failed", details: e instanceof Error ? e.message : String(e) }), { status: 500 });
    }
  },

  async getBalances(userId: number) {
    try {
      const userBalances = await db.select()
        .from(balances)
        .innerJoin(wallets, eq(balances.walletId, wallets.id))
        .where(eq(wallets.userId, userId));

      return new Response(JSON.stringify(userBalances), { status: 200 });
    } catch (e) {
      console.error("\x1b[31m[Profile Error]\x1b[0m Failed to fetch balances:", e);
      return new Response(JSON.stringify({ error: "Failed to fetch balances", details: e instanceof Error ? e.message : String(e) }), { status: 500 });
    }
  }
};
