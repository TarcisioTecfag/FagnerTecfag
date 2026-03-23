import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Detecção de banco de dados ───────────────────────────────────────────────
// Em produção (Railway), DATABASE_URL aponta para PostgreSQL.
// Por ora, o sistema usa better-sqlite3 com a mesma interface síncrona.
// A migração completa para pg/Drizzle é feita via script separado (server/migrate.ts).
const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (DATABASE_URL.startsWith("postgresql://") || DATABASE_URL.startsWith("postgres://")) {
  console.warn("⚠️  DATABASE_URL detectado (PostgreSQL Railway).");
  console.warn("   O sistema está rodando com SQLite embutido como fallback.");
  console.warn("   Dados persistidos em: /app/data/app.db (volume do Railway).");
}

const DB_PATH = path.join(__dirname, "..", "data", "app.db");

// Garante que a pasta data/ existe
const dataDir = path.join(__dirname, "..", "data");
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  console.error(`❌ Não foi possível criar o diretório de dados: ${dataDir}`, e);
  console.error("   Verifique se o volume /app/data está montado no Railway.");
  process.exit(1);
}

let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  console.log(`✅ Banco SQLite aberto em: ${DB_PATH}`);
} catch (e) {
  console.error("❌ Falha ao abrir o banco SQLite:", e);
  console.error("   Possível causa: binário nativo better-sqlite3 não compilado para esta plataforma.");
  console.error("   Execute: npm rebuild better-sqlite3 --update-binary");
  process.exit(1);
}

export { db };
export default db;

// ─── Schema SQLite ───────────────────────────────────────────────────────────
// Cria todas as tabelas que o sistema precisa (idempotente via IF NOT EXISTS).

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
