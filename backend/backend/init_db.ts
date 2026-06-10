import { sql } from "bun";

const db = new sql(process.env.DATABASE_URL || "postgres://statpro@localhost:5432/statpro");

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  address VARCHAR(64) UNIQUE NOT NULL,
  wallet_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER REFERENCES wallets(id) NOT NULL,
  asset VARCHAR(20) NOT NULL,
  amount DECIMAL(18, 8) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  wallet_id INTEGER REFERENCES wallets(id) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(18, 8) NOT NULL,
  price DECIMAL(18, 8) NOT NULL,
  status VARCHAR(20) NOT NULL,
  pnl DECIMAL(18, 2),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function init() {
  try {
    await db.execute(schema);
    console.log("✅ Database schema initialized successfully.");
  } catch (e) {
    console.error("❌ Error initializing database:", e);
  } finally {
    process.exit();
  }
}

init();
