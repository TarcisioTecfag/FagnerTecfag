import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

// ─── Pool PostgreSQL ──────────────────────────────────────────────────────────
// DATABASE_URL é obrigatório — sem SQLite fallback.

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[DB] ❌ DATABASE_URL não está definida. PostgreSQL é obrigatório.");
  console.error("    Defina DATABASE_URL no .env ou nas variáveis de ambiente do Railway.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Railway usa SSL por padrão
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[DB] ❌ Erro inesperado no pool PostgreSQL:", err.message);
});

console.log("[DB] ✅ Pool PostgreSQL configurado");

// ─── Drizzle ORM ──────────────────────────────────────────────────────────────

const db = drizzle(pool, { schema });

// ─── Schema bootstrap (idempotente) ─────────────────────────────────────────
// Cria tabelas via SQL direto para garantir que existam antes do primeiro uso.
// Equivale ao que o SQLite fazia com CREATE TABLE IF NOT EXISTS.

export async function bootstrapSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
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
        "startTime"          TEXT NOT NULL,
        "endTime"            TEXT,
        status               TEXT NOT NULL DEFAULT 'RUNNING',
        "clientName"         TEXT,
        "clientPhone"        TEXT,
        "capturedData"       TEXT,
        archived             TEXT NOT NULL DEFAULT 'false',
        annotation           TEXT,
        "assignedOperatorName" TEXT,
        "contactId"          TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id        TEXT PRIMARY KEY,
        "sessionId" TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT now()::text,
        sender    TEXT NOT NULL,
        content   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id        TEXT PRIMARY KEY,
        "sessionId" TEXT,
        timestamp TEXT NOT NULL DEFAULT now()::text,
        level     TEXT NOT NULL DEFAULT 'INFO',
        message   TEXT NOT NULL,
        source    TEXT NOT NULL DEFAULT 'bot'
      );

      CREATE TABLE IF NOT EXISTS folders (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        "parentId"  TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS documents (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        type      TEXT NOT NULL,
        "mimeType"  TEXT NOT NULL,
        content   TEXT,
        embedding TEXT,
        "filePath"  TEXT NOT NULL,
        "folderId"  TEXT,
        paused    TEXT NOT NULL DEFAULT 'false',
        "fileData"  TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS api_costs (
        id        TEXT PRIMARY KEY,
        service   TEXT NOT NULL,
        operation TEXT NOT NULL,
        cost      REAL NOT NULL DEFAULT 0,
        currency  TEXT NOT NULL DEFAULT 'BRL',
        tokens    INTEGER,
        notes     TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS vtex_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vtex_logs (
        id          TEXT PRIMARY KEY,
        timestamp   TEXT NOT NULL DEFAULT now()::text,
        type        TEXT NOT NULL,
        description TEXT NOT NULL,
        product     TEXT,
        autonomous  INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS vtex_failures (
        id        TEXT PRIMARY KEY,
        query     TEXT NOT NULL,
        reason    TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        resolved  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS vtex_synonyms (
        id        TEXT PRIMARY KEY,
        term      TEXT NOT NULL,
        canonical TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS prompt_history (
        id        TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT now()::text,
        value     TEXT NOT NULL,
        "changedBy" TEXT NOT NULL DEFAULT 'Sistema'
      );

      CREATE TABLE IF NOT EXISTS "http_sessions" (
        "sid" TEXT PRIMARY KEY NOT NULL,
        "sess" JSON NOT NULL,
        "expire" TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_http_sessions_expire" ON "http_sessions" ("expire");

      -- ─── Live Chat (módulo isolado) ─────────────────────────────────
      CREATE TABLE IF NOT EXISTS lc_visitors (
        id              TEXT PRIMARY KEY,
        "cookieId"      TEXT NOT NULL,
        ip              TEXT,
        city            TEXT,
        country         TEXT,
        browser         TEXT,
        "userAgent"     TEXT,
        "currentPage"   TEXT,
        "currentPageTitle" TEXT,
        source          TEXT,
        "utmSource"     TEXT,
        "utmMedium"     TEXT,
        "utmCampaign"   TEXT,
        referrer        TEXT,
        "totalVisits"   INTEGER NOT NULL DEFAULT 1,
        "totalPages"    INTEGER NOT NULL DEFAULT 0,
        "totalChats"    INTEGER NOT NULL DEFAULT 0,
        category        TEXT NOT NULL DEFAULT 'visitor',
        "engagementScore" INTEGER NOT NULL DEFAULT 0,
        "isOnline"      TEXT NOT NULL DEFAULT 'true',
        "firstSeenAt"   TEXT NOT NULL DEFAULT now()::text,
        "lastSeenAt"    TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS lc_pageviews (
        id          TEXT PRIMARY KEY,
        "visitorId" TEXT NOT NULL,
        url         TEXT NOT NULL,
        "pageTitle" TEXT,
        "scrollDepth" INTEGER,
        "timeSpent"   INTEGER,
        "visitedAt"   TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS lc_chats (
        id              TEXT PRIMARY KEY,
        "visitorId"     TEXT NOT NULL,
        "agentId"       TEXT,
        status          TEXT NOT NULL DEFAULT 'waiting',
        "startedAt"     TEXT NOT NULL DEFAULT now()::text,
        "endedAt"       TEXT,
        "visitorName"   TEXT,
        "visitorEmail"  TEXT,
        source          TEXT NOT NULL DEFAULT 'widget',
        "aiHandled"     TEXT NOT NULL DEFAULT 'true',
        "needsHuman"    TEXT NOT NULL DEFAULT 'false',
        "proactiveApproach" TEXT NOT NULL DEFAULT 'false',
        mood            TEXT
      );

      CREATE TABLE IF NOT EXISTS lc_messages (
        id      TEXT PRIMARY KEY,
        "chatId" TEXT NOT NULL,
        sender  TEXT NOT NULL,
        content TEXT NOT NULL,
        read    TEXT NOT NULL DEFAULT 'false',
        "sentAt" TEXT NOT NULL DEFAULT now()::text
      );

      CREATE TABLE IF NOT EXISTS lc_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lc_report_logs (
        id            TEXT PRIMARY KEY,
        "reportName"  TEXT NOT NULL,
        "downloadedBy" TEXT NOT NULL,
        "filtersUsed" JSONB,
        "downloadedAt" TEXT NOT NULL DEFAULT now()::text
      );
    `);
    console.log("[DB] ✅ Schema PostgreSQL criado/verificado com sucesso");

    // ─── Migrations idempotentes (ADD COLUMN IF NOT EXISTS) ───────────
    await client.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';`);
    await client.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0;`);
    await client.query(`ALTER TABLE lc_visitors ADD COLUMN IF NOT EXISTS "posVendaCnpjData" JSONB;`);
    await client.query(`ALTER TABLE lc_chats ADD COLUMN IF NOT EXISTS "closeReason" TEXT;`);
    console.log("[DB] ✅ Migrações idempotentes aplicadas (folders, lc_visitors, lc_chats)");

    // ─── Fagner Conversas CRM ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fc_cards (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        company         TEXT,
        phone           TEXT,
        email           TEXT,
        cnpj_cpf        TEXT,
        tipo_empresa    TEXT,
        city            TEXT,
        segment         TEXT,
        channel         TEXT NOT NULL DEFAULT 'WhatsApp',
        column_id       TEXT NOT NULL DEFAULT 'pos-venda',
        note            TEXT,
        ai_status       TEXT NOT NULL DEFAULT 'analyzing',
        progress        INTEGER NOT NULL DEFAULT 0,
        rd_contact_id   TEXT,
        rd_deal_id      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS fc_funnel_data (
        id          TEXT PRIMARY KEY,
        card_id     TEXT NOT NULL REFERENCES fc_cards(id) ON DELETE CASCADE,
        field_id    TEXT NOT NULL,
        value       TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(card_id, field_id)
      );

      CREATE TABLE IF NOT EXISTS fc_score (
        id           TEXT PRIMARY KEY,
        card_id      TEXT NOT NULL REFERENCES fc_cards(id) ON DELETE CASCADE UNIQUE,
        necessidade  INTEGER CHECK(necessidade BETWEEN 1 AND 5),
        urgencia     INTEGER CHECK(urgencia BETWEEN 1 AND 5),
        decisor      INTEGER CHECK(decisor BETWEEN 1 AND 5),
        engajamento  INTEGER CHECK(engajamento BETWEEN 1 AND 5),
        avanco       INTEGER CHECK(avanco BETWEEN 1 AND 5),
        rating       INTEGER,
        evaluated_at TIMESTAMPTZ,
        evaluated_by TEXT
      );

      CREATE TABLE IF NOT EXISTS fc_history (
        id          TEXT PRIMARY KEY,
        card_id     TEXT NOT NULL REFERENCES fc_cards(id) ON DELETE CASCADE,
        type        TEXT NOT NULL DEFAULT 'entry',
        label       TEXT NOT NULL,
        detail      TEXT,
        field_name  TEXT,
        old_value   TEXT,
        new_value   TEXT,
        author      TEXT NOT NULL DEFAULT 'Sistema',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_fc_funnel_card ON fc_funnel_data(card_id);
      CREATE INDEX IF NOT EXISTS idx_fc_history_card ON fc_history(card_id);
    `);
    console.log("[DB] ✅ Tabelas Fagner Conversas CRM criadas/verificadas (fc_cards, fc_funnel_data, fc_score, fc_history)");
  } catch (e) {
    console.error("[DB] ❌ Falha ao criar schema PostgreSQL:", e);
  } finally {
    client.release();
  }
}

export { db, pool };
export default db;
