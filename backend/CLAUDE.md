# Statpro API Layer - Project Documentation

## Project Overview
Statpro is a high-performance trading platform. The API layer serves as the **Orchestration Layer**, acting as the gateway between the frontend clients and the backend microservices. Its primary responsibility is to manage user identity, maintain account state, and coordinate the execution of trades across various specialized services.

## 🏗️ System Architecture

### High-Level Flow
`Client (UI)` $\rightarrow$ `API Layer (Bun)` $\rightarrow$ `Microservices (Datafeed/Engine/Execution)` $\rightarrow$ `Blockchain`

### Role of the API Layer
The API layer does not perform heavy computation or direct blockchain interaction. Instead, it:
1.  **Authenticates** the user and validates the request.
2.  **Orchestrates** a sequence of calls to microservices:
    *   **Datafeed Server**: Fetches real-time market prices.
    *   **Engine**: Performs risk management and margin validation.
    *   **Execution Service**: Triggers the actual on-chain transaction.
3.  **Persists** the state of users, wallets, and trades in the database.

### Microservices Integration
- **Datafeed Server**: Synchronous REST/WS calls for price verification.
- **Engine**: Synchronous calls to check if a user has sufficient collateral.
- **Execution Service**: Asynchronous triggers. The API layer requests an execution; the Execution service confirms once the transaction is mined.

---

## 🛠️ Technical Stack
- **Runtime**: [Bun](https://bun.sh) (Used for native speed, built-in `Bun.serve()`, and fast TypeScript execution).
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) (Type-safe, lightweight, and highly performant).
- **Database**: SQLite (Development) / PostgreSQL (Production).
- **Authentication**: JWT (JSON Web Tokens) for session management.
- **Wallet Integration**: Trust Wallet Agent Kit for autonomous intent execution.

---

## 📂 Module Breakdown

### `index.ts` (The Entry Point)
- Initializes `Bun.serve()`.
- Defines the API routing table.
- Connects the HTTP requests to the specific controllers in `src/`.

### `src/client.ts` (Database Connection)
- Exports the Drizzle database instance.
- Manages connection pooling and environment configuration.

### `src/schema.ts` (Data Models)
- Definitive source for all database tables.
- Ensures type safety across the entire application.

### `src/auth.ts` (Identity & Access)
- **Signup**: Password hashing and user creation.
- **Signin**: Validation and JWT issuance.
- **Middleware**: Validates tokens for protected routes.

### `src/profile.ts` (User State)
- Manages user profile data, preferences, and account status.
- Handles balance lookups and wallet associations.

### `src/trade.ts` (The Trade Orchestrator)
The core logic for executing a trade:
1. **Verify Price** $\rightarrow$ Call Datafeed Server.
2. **Risk Check** $\rightarrow$ Call Engine.
3. **Initialize Intent** $\rightarrow$ Interface with Trust Wallet Agent Kit.
4. **Trigger Execution** $\rightarrow$ Send request to Execution Service.
5. **Update State** $\rightarrow$ Mark trade as `filled` or `failed` in DB.

---

## 🤖 Trust Wallet Agent Kit & Autonomous Wallets

Statpro implements **Intent-Based Trading** using the Trust Wallet Agent Kit.

### The Concept
Instead of a traditional "Sign every transaction" flow, users utilize **Autonomous Wallets** (Smart Accounts). 
- Users set an "Intent" (e.g., "Buy 1 BTC if price hits $60k").
- The API layer passes this intent to the **Agent Kit**.
- The Agent manages the private key interaction and triggers the execution autonomously when conditions are met.

### Integration Flow
`Request Trade` $\rightarrow$ `API Layer` $\rightarrow$ `Agent Kit` $\rightarrow$ `Autonomous Wallet` $\rightarrow$ `Execution Service` $\rightarrow$ `On-chain TX`.

---

## 📊 Database Schema Design

| Table | Key Fields | Description |
| :--- | :--- | :--- |
| **Users** | `id`, `email`, `passwordHash` | Core identity and authentication data. |
| **Profiles** | `userId`, `username`, `status` | User-facing metadata and account state. |
| **Wallets** | `id`, `userId`, `address`, `agentId` | Mapping of users to blockchain addresses and Agent Kit IDs. |
| **Balances** | `userId`, `asset`, `available`, `locked` | Real-time tracking of user funds. |
| **Trades** | `id`, `userId`, `symbol`, `amount`, `status` | History and state of all buy/sell orders. |

---

## 🚀 Development Guidelines

### Bun Commands
- **Run**: `bun index.ts`
- **Install**: `bun install`
- **Test**: `bun test`
- **Build**: `bun build <file>`

### Coding Standards
- Use `Bun.serve()` instead of Express for the HTTP layer.
- Use `Bun.sql` or `bun:sqlite` for database interactions via Drizzle.
- Prefer absolute paths for imports.
- All database changes must be reflected in `src/schema.ts`.
