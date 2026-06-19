import { db } from "./client";
import { profiles, balances, wallets, users } from "./schema";
import { eq } from "drizzle-orm";
import { safeParseJson, jsonResponse, errorResponse } from "./utils";

export const profile = {
  async get(userId: number) {
    const [userProfile] = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        bio: profiles.bio,
        avatarUrl: profiles.avatarUrl,
        username: users.username,
        email: users.email,
        status: "Active"
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!userProfile) {
      return jsonResponse({ message: "Profile not found" }, 404);
    }

    return jsonResponse(userProfile);
  },

  async update(userId: number, req: Request) {
    try {
      const body = await safeParseJson(req);
      if (!body) return errorResponse("Missing body", 400);
      const { bio, avatarUrl } = body;

      await db.update(profiles)
        .set({ bio, avatarUrl })
        .where(eq(profiles.userId, userId));

      return jsonResponse({ message: "Profile updated" });
    } catch (e) {
      return errorResponse("Update failed", 400);
    }
  },

  async getBalances(userId: number) {
    try {
      const userBalances = await db.select()
        .from(balances)
        .innerJoin(wallets, eq(balances.walletId, wallets.id))
        .where(eq(wallets.userId, userId));

      return jsonResponse(userBalances);
    } catch (e) {
      return errorResponse("Failed to fetch balances", 500);
    }
  }
};
