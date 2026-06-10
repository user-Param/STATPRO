import { db } from "./client";
import { profiles, balances, wallets } from "./schema";
import { eq } from "drizzle-orm";

export const profile = {
  async get(userId: number) {
    const [userProfile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    return new Response(JSON.stringify(userProfile || { message: "Profile not found" }), { status: 200 });
  },

  async update(userId: number, req: Request) {
    try {
      const { bio, avatarUrl } = await req.json();

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
