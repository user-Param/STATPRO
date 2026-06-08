\c statpro

-- Create tables first
CREATE TABLE IF NOT EXISTS market_data (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    bid DECIMAL(18, 8),
    ask DECIMAL(18, 8),
    volume DECIMAL(18, 8)
);

CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data(timestamp);

CREATE TABLE IF NOT EXISTS strategies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    language VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    total_balance DECIMAL(18, 2) DEFAULT 0.00,
    active_strategies_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_history (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER REFERENCES profiles(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    pnl DECIMAL(18, 2),
    status VARCHAR(20),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grant privileges AFTER tables exist
GRANT USAGE ON SCHEMA public TO statpro;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO statpro;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO statpro;

-- Ensure future tables created by param (superuser) are also accessible to statpro
ALTER DEFAULT PRIVILEGES FOR ROLE param IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO statpro;

ALTER DEFAULT PRIVILEGES FOR ROLE param IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO statpro;
