import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema";

// Bun.sql is natively supported and high performance
const sql = new SQL(process.env.DATABASE_URL || "postgres://statpro:statpro@localhost:5432/statpro");

export const db = drizzle(sql, { schema, logger: true });
