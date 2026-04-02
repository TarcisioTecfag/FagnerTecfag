// server/fagner/geminiService.ts
// Integração completa com Google Gemini:
// - Sessão isolada por contato (startChat)
// - Retry com backoff exponencial (5x)
// - Circuit Breaker (5 falhas → 3 min off)
// - RAG (busca semântica em documentos)
// - Humanização de números
// - Split humanizado da resposta (parágrafos + delays)
// - Registro de custo em api_costs

import { v4 as uuidv4 } from "uuid";
import { buildSystemPrompt, buildFrustrationContext } from "./systemPrompt.js";
import { buildSessionSummary, ContactSession } from "./sessionManager.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_CHAT_MODEL      = "gemini-1.5-flash";
const GEMINI_EMBED_MODEL     = "gemini-embedding-001";
const GEMINI_BASE            = "https://generativelanguage.googleapis.com/v1beta";

// ─── Padrões de frustração ────────────────────────────────────────────────────

const FRUSTRATION_PATTERNS = [
  /já\s+falei/i,
  /voc[eê]\s+n[aã]o\s+entendeu/i,
  /que\s+saco/i,
  /isso\s+[eé]\s+uma\s+piada/i,
  /!{2,}/,
  /já\s+te\s+passei/i,
  /já\s+te\s+informei/i,
  /já\s+disse/i,
  /já\s+mandei/i,
  /repetindo/i,
  /mesma\s+coisa/i,
  /de\s+novo\?/i,
];

export function detectFrustration(text: string): boolean {
  return FRUSTRATION_PATTERNS.some((p) => p.test(text));
}

// ─── Humanização de números ───────────────────────────────────────────────────

export function humanizeNumbers(text: string): string {
  return text
    // R$15000,00 → uns R$15 mil
    .replace(/R\$\s*(\d+)\.?(\d{3}),\d{2}/g, (_, mil, cents) =>
      `uns R$${mil}${cents ? " mil" : ""}`
    )
    // 14 dias úteis → umas duas semanas
    .replace(/14\s+dias\s+[uú]teis/gi, "umas duas semanas")
    .replace(/7\s+dias\s+[uú]teis/gi, "uma semana")
    // 1.000 unidades → mil unidades
    .replace(/1\.000\s+(unidades|pe[cç]as)/gi, "mil $1")
    .replace(/1\.500\s+(unidades|pe[cç]as)/gi, "mil e quinhentas $1")
    .replace(/2\.000\s+(unidades|pe[cç]as)/gi, "duas mil $1");
}

// ─── Split humanizado ─────────────────────────────────────────────────────────

export interface MessagePart {
  text: string;
  delayMs: number;
}

export function splitHumanized(text: string): MessagePart[] {
  const MIN_CHARS  = 40;
  const MAX_CHARS  = 280;
  const MAX_DELAY  = 4_000;
  const WPM        = 160; // palavras por minuto de digitação

  // Divide por parágrafos
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const parts: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= MAX_CHARS) {
      parts.push(para);
    } else {
      // Divide por frases
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
      let chunk = "";
      for (const s of sentences) {
        if ((chunk + s).length > MAX_CHARS && chunk.length >= MIN_CHARS) {
          parts.push(chunk.trim());
          chunk = s;
        } else {
          chunk += s;
        }
      }
      if (chunk.trim()) parts.push(chunk.trim());
    }
  }

  // Une partes muito curtas com a próxima (exceto se contiverem links)
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const isUrl = parts[i].includes("http") || parts[i].includes("/uploads");
    if (parts[i].length < MIN_CHARS && i < parts.length - 1 && !isUrl) {
      parts[i + 1] = `${parts[i]} ${parts[i + 1]}`;
    } else {
      merged.push(parts[i]);
    }
  }

  // Calcula delay por nº de palavras
  return merged.map((t) => {
    const words = t.split(/\s+/).length;
    const delay = Math.min((words / WPM) * 60_000 * 0.5, MAX_DELAY);
    return { text: t, delayMs: Math.round(delay) };
  });
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

let cbFailures   = 0;
let cbOpenedAt: number | null = null;
const CB_THRESHOLD = 5;
const CB_RESET_MS  = 60_000; // 1 minuto

function cbIsOpen(): boolean {
  if (cbOpenedAt === null) return false;
  if (Date.now() - cbOpenedAt > CB_RESET_MS) {
    // Reset automático
    cbFailures = 0;
    cbOpenedAt = null;
    console.log("[Gemini] Circuit Breaker resetado.");
    return false;
  }
  return true;
}

function cbRecordFailure() {
  cbFailures++;
  if (cbFailures >= CB_THRESHOLD && cbOpenedAt === null) {
    cbOpenedAt = Date.now();
    console.warn(`[Gemini] Circuit Breaker ABERTO após ${cbFailures} falhas.`);
  }
}

function cbRecordSuccess() {
  cbFailures = 0;
  cbOpenedAt = null;
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────

const RETRY_DELAYS = [3_000, 8_000, 15_000];
const RETRYABLE_PATTERNS = [
  /503/,
  /overloaded/i,
  /Service Unavailable/i,
  /fetch failed/i,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
];
// Erros 4xx nunca devem ser retentados (key inválida, quota, etc.)
const NON_RETRYABLE_PATTERN = /Gemini HTTP 4\d\d/;

function isRetryable(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  if (NON_RETRYABLE_PATTERN.test(msg)) return false;
  return RETRYABLE_PATTERNS.some((p) => p.test(msg));
}

async function geminiRequest(
  url: string,
  payload: object,
  signal?: AbortSignal
): Promise<any> {
  let lastErr: any;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: signal ?? AbortSignal.timeout(30_000), // 30s max
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
        if (isRetryable(err) && attempt < RETRY_DELAYS.length) {
          console.warn(`[Gemini] Tentativa ${attempt + 1} falhou, retry em ${RETRY_DELAYS[attempt] / 1000}s...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          lastErr = err;
          continue;
        }
        throw err;
      }

      cbRecordSuccess();
      return await res.json();
    } catch (err: any) {
      lastErr = err;
      if (isRetryable(err) && attempt < RETRY_DELAYS.length) {
        console.warn(`[Gemini] Erro retryable (tentativa ${attempt + 1}): ${err.message}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      break;
    }
  }

  cbRecordFailure();
  throw lastErr;
}

// ─── RAG — Busca semântica em documentos ─────────────────────────────────────

interface RagDocument {
  id: string;
  name: string;
  content: string;
  embedding?: number[];
  filePath?: string;
}

// Cache simples de embeddings por documento
const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (embeddingCache.has(text)) return embeddingCache.get(text)!;

  const url = `${GEMINI_BASE}/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: `models/${GEMINI_EMBED_MODEL}`, content: { parts: [{ text }] } }),
    signal: AbortSignal.timeout(10_000), // 10s max
  });

  if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
  const data: any = await res.json();
  const vec = data?.embedding?.values ?? [];
  embeddingCache.set(text, vec);
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const dot  = a.reduce((acc, v, i) => acc + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
  const magB = Math.sqrt(b.reduce((acc, v) => acc + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

export async function ragSearch(
  query: string,
  docs: RagDocument[],
  apiKey: string,
  topK = 3
): Promise<string> {
  if (docs.length === 0) return "";

  try {
    const queryVec = await getEmbedding(query, apiKey);

    const scored: { doc: RagDocument; score: number }[] = [];
    
    // Batch processing to avoid 429 Rate Limit (max 5 concurrent reqs)
    const BATCH_SIZE = 5;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      const batchScored = await Promise.all(
        batch.map(async (doc) => {
          const vec = await getEmbedding(doc.content.slice(0, 2000), apiKey);
          const score = cosineSimilarity(queryVec, vec);
          return { doc, score };
        })
      );
      scored.push(...batchScored);
      // Small pause if more batches remain to respect quotas
      if (i + BATCH_SIZE < docs.length) {
        await new Promise(res => setTimeout(res, 300));
      }
    }

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(topK, 5))
      .filter((x) => x.score > 0.15);

    if (top.length === 0) return "";

    return top
      .map((x) => `[Documento: ${x.doc.name} | Link de Download: ${x.doc.filePath || ""}]\n${x.doc.content.slice(0, 800)}`)
      .join("\n\n---\n\n");
  } catch (e) {
    console.warn("[RAG] Busca semântica falhou (ignorando):", e);
    return "";
  }
}

// ─── Inicialização da sessão de chat ─────────────────────────────────────────

export function initChatSession(apiKey: string, session: ContactSession): void {
  // Guardar estado no session — gerenciamos histórico manualmente
  session.chatSession = {
    apiKey,
    history: [] as { role: string; parts: any[] }[],
  };
}

// ─── Chamada principal ao Gemini ──────────────────────────────────────────────

export interface GeminiCallOptions {
  session: ContactSession;
  userMessage: string;
  apiKey: string;
  ragContext?: string;         // contexto RAG já buscado
  extraContext?: string;       // CNPJ, mídia, frustração, etc.
  logCost?: (tokens: number, prompt: number, output: number) => void;
}

export async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const { session, userMessage, apiKey, ragContext, extraContext, logCost } = opts;

  if (cbIsOpen()) {
    console.error("[Gemini] Circuit Breaker está aberto — rejeitando chamada.");
    return "Opa, não consegui ver direito oque você me mandou, pode enviar novamente por favor?";
  }

  // Monta extra context com RAG + info de contexto
  const contextParts: string[] = [];
  if (ragContext) contextParts.push(`## BASE DE CONHECIMENTO RELEVANTE\n${ragContext}`);
  if (extraContext) contextParts.push(extraContext);
  const fullExtra = contextParts.join("\n\n");

  const systemPrompt = buildSystemPrompt(session.sessionMood, fullExtra || undefined);

  const cs = session.chatSession;
  const history: { role: string; parts: any[] }[] = cs?.history ?? [];

  // Detecta frustração e injeta resumo da sessão
  let userParts: any[] = [{ text: userMessage }];
  if (detectFrustration(userMessage)) {
    const summary = buildSessionSummary(session);
    const frustCtx = buildFrustrationContext(summary);
    userParts = [{ text: `${frustCtx}\n\n${userMessage}` }];
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...history, { role: "user", parts: userParts }],
    generationConfig: { temperature: 0.75, maxOutputTokens: 8192 },
  };

  const url = `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;

  const data = await geminiRequest(url, payload);

  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(sem resposta)";
  
  // Força quebras de linha duplas ao redor de URLs para garantir balões separados
  const responseText = humanizeNumbers(raw)
    .replace(/(https?:\/\/[^\s)]+)/gi, "\n\n$1\n\n")
    .replace(/(\/uploads\/[^\s)]+)/gi, "\n\n$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const promptTokens: number    = data?.usageMetadata?.promptTokenCount ?? 0;
  const candidateTokens: number = data?.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens             = promptTokens + candidateTokens;

  // Atualiza histórico da sessão
  if (cs) {
    cs.history.push({ role: "user", parts: userParts });
    cs.history.push({ role: "model", parts: [{ text: responseText }] });
    // Limita histórico a 60 turnos (120 entries)
    if (cs.history.length > 120) {
      cs.history = cs.history.slice(-120);
    }
  }

  // Registra custo
  if (logCost) logCost(totalTokens, promptTokens, candidateTokens);

  return responseText;
}

// ─── Extração de relatório (one-shot) ────────────────────────────────────────

export async function extractReportJson(
  prompt: string,
  apiKey: string
): Promise<Record<string, any>> {
  if (cbIsOpen()) return {};

  const url = `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  };

  try {
    const data = await geminiRequest(url, payload);
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("[Gemini] Erro ao extrair JSON do relatório:", e);
    return {};
  }
}
