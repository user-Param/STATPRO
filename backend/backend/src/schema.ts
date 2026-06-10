import { pgTable, serial, varchar, text, timestamp, decimal, integer } from "drizzle-orm/pg-core";

// Users: Authentication and account status
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 100 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Profiles: Extended user information
export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Wallets: Trust Wallet Agent Kit linked wallets
export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  address: varchar("address", { length: 64 }).unique().notNull(), // Public key from Agent Kit
  walletType: varchar("wallet_type", { length: 20 }).notNull(), // e.g., 'autonomous', 'managed'
  createdAt: timestamp("created_at").defaultNow(),
});

// Balances: Tracking assets per wallet
export const balances = pgTable("balances", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => wallets.id).notNull(),
  asset: varchar("asset", { length: 20 }).notNull(), // e.g., 'BTC', 'ETH', 'USD'
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Trades/Orders: Order book and execution tracking
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  walletId: integer("wallet_id").references(() => wallets.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  side: varchar("side", { length: 10 }).notNull(), // 'BUY' or 'SELL'
  type: varchar("type", { length: 20 }).notNull(), // 'MARKET', 'LIMIT'
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(), // 'PENDING', 'FILLED', 'CANCELLED'
  pnl: decimal("pnl", { precision: 18, scale: 2 }),
  timestamp: timestamp("timestamp").defaultNow(),
});
