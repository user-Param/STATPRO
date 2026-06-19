import { db } from "./client";
import { profiles, balances, wallets, users } from "./schema";
import { eq, sql } from "drizzle-orm";
import { safeParseJson } from "./utils";

export const profile = {
  async get(userId: number) {
    const [userProfile] = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        bio: profiles.bio,
        avatarUrl: profiles.avatarUrl,
        // Get username and email from users table
        username: users.username,
        email: users.email,
        status: sql<string>`'Active'`.as('status')
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!userProfile) {
      return new Response(JSON.stringify({ message: "Profile not found" }), { status: 404 });
    }

    return new Response(JSON.stringify(userProfile), { status: 200 });
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
      return new Response(JSON.stringify({ error: "Update failed" }), { status: 400 });
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
      return new Response(JSON.stringify({ error: "Failed to fetch balances" }), { status: 500 });
    }
  }
};
