import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

// Quando DATABASE_URL estiver configurado = PostgreSQL (Railway)
// Quando não estiver = SQLite local
const isPostgres = !!process.env.DATABASE_URL;

export default defineConfig(
  isPostgres
    ? {
        dialect: "postgresql",
        schema: "./shared/schema.ts",
        out: "./drizzle",
        dbCredentials: {
          url: process.env.DATABASE_URL!,
        },
      }
    : {
        dialect: "sqlite",
        schema: "./shared/schema.sqlite.ts",
        out: "./drizzle",
        dbCredentials: {
          url: "./data/app.db",
        },
      }
);
