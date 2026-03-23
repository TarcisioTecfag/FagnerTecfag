import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Caminho do banco ─────────────────────────────────────────────────────────
// Em produção (Railway): usa /tmp/data que é SEMPRE gravável em Docker.
// Em desenvolvimento local: usa ./data relativo ao projeto.
const isProduction = process.env.NODE_ENV === "production";
const DB_DIR  = isProduction
  ? "/tmp/data"
  : path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "app.db");

console.log(`[DB] Ambiente: ${isProduction ? "production" : "development"}`);
console.log(`[DB] Caminho do banco: ${DB_PATH}`);

// ─── Garante que o diretório existe ──────────────────────────────────────────
try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`[DB] Diretório criado: ${DB_DIR}`);
  }
} catch (e) {
  console.error(`[DB] ❌ Não foi possível criar o diretório ${DB_DIR}:`, e);
  process.exit(1);
}

// ─── Abre o banco SQLite ──────────────────────────────────────────────────────
let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  console.log(`[DB] ✅ Banco SQLite aberto com sucesso`);
} catch (e) {
  console.error("[DB] ❌ Falha ao abrir o banco SQLite:", e);
  console.error("    Possível causa: binário nativo better-sqlite3 incompatível.");
  console.error("    Execute: npm rebuild better-sqlite3 --update-binary");
  process.exit(1);
}

// ─── Schema SQLite ────────────────────────────────────────────────────────────
// Cria todas as tabelas (idempotente via IF NOT EXISTS).
// IMPORTANTE: wrapped em try/catch para não crashar antes dos error handlers.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      email    TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id    TEXT PRIMARY KEY,
      key   TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id                   TEXT PRIMARY KEY,
      startTime            TEXT NOT NULL,
      endTime              TEXT,
      status               TEXT NOT NULL DEFAULT 'RUNNING',
      clientName           TEXT,
      clientPhone          TEXT,
      capturedData         TEXT,
      archived             TEXT NOT NULL DEFAULT 'false',
      annotation           TEXT,
      assignedOperatorName TEXT,
      contactId            TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id        TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      sender    TEXT NOT NULL,
      content   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id        TEXT PRIMARY KEY,
      sessionId TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      level     TEXT NOT NULL DEFAULT 'INFO',
      message   TEXT NOT NULL,
      source    TEXT NOT NULL DEFAULT 'bot'
    );

    CREATE TABLE IF NOT EXISTS folders (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      parentId  TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      type      TEXT NOT NULL,
      mimeType  TEXT NOT NULL,
      content   TEXT,
      embedding TEXT,
      filePath  TEXT NOT NULL,
      folderId  TEXT,
      paused    TEXT NOT NULL DEFAULT 'false',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_costs (
      id        TEXT PRIMARY KEY,
      service   TEXT NOT NULL,
      operation TEXT NOT NULL,
      cost      REAL NOT NULL DEFAULT 0,
      currency  TEXT NOT NULL DEFAULT 'BRL',
      tokens    INTEGER,
      notes     TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vtex_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vtex_logs (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
      type        TEXT NOT NULL,
      description TEXT NOT NULL,
      product     TEXT,
      autonomous  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS vtex_failures (
      id        TEXT PRIMARY KEY,
      query     TEXT NOT NULL,
      reason    TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      resolved  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vtex_synonyms (
      id        TEXT PRIMARY KEY,
      term      TEXT NOT NULL,
      canonical TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log("[DB] ✅ Schema criado/verificado com sucesso");
} catch (e) {
  console.error("[DB] ❌ Falha ao criar schema SQLite:", e);
  // Não exit — o servidor pode funcionar parcialmente e o log ajuda no diagnóstico
}

export { db };
export default db;
