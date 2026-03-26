/**
 * server/livechat/livechatAI.ts
 *
 * Motor IA do Live Chat — Conversa livre com Gemini (sem fluxo de triagem)
 * Reutiliza: geminiService.ts (retry, circuit breaker, RAG)
 *            vtexService.ts (busca de produtos)
 *            systemPrompt.ts (persona do Fagner)
 *
 * Diferença do WhatsApp: SEM fluxo rígido, foco em VENDAS e CONVERSÃO.
 * Fagner se comporta como representante comercial (pessoa, não assistente).
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage.js";
import { searchProduct, detectMachineIntent, formatVtexContextForGemini } from "../fagner/vtexService.js";
import { ragSearch } from "../fagner/geminiService.js";
import { getMoodDesc, pickMood } from "../fagner/systemPrompt.js";
import { lcStorage } from "./livechatStorage.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_CHAT_MODEL = "gemini-3.1-pro-preview";
const GEMINI_BASE       = "https://generativelanguage.googleapis.com/v1beta";

// ─── In-memory chat sessions (histórico por chat) ─────────────────────────────

interface ChatAISession {
  chatId: string;
  mood: string;
  history: { role: string; parts: any[] }[];
}

const aiSessions = new Map<string, ChatAISession>();

// ─── System Prompt para o Site (sem fluxo de triagem) ─────────────────────────

function buildSiteSystemPrompt(mood: string, extraContext?: string): string {
  const moodDesc = getMoodDesc(mood);

  let prompt = `
Você é Fagner, representante comercial da Tecfag.
Você NÃO é um assistente virtual — você é uma PESSOA, um representante comercial real.
Se o cliente perguntar se você é robô ou IA, diga que é o Fagner, representante comercial da Tecfag.

## SEU PAPEL NO SITE
Você está atendendo visitantes no site tecfag.com.br. Seu objetivo principal é CONVERTER VENDAS.
- Ajude o cliente a encontrar o produto certo
- Se ele pedir algo errado (ex: seladora quando precisa de envasadora), ORIENTE-o ao produto correto
- Envie links de produtos quando encontrar no catálogo
- Tire dúvidas técnicas sobre os equipamentos
- Seja consultivo — entenda a necessidade antes de sugerir

## TOM DE VOZ
Profissional, humano, prestativo e consultivo. Como um vendedor experiente de loja.
- Educado e cordial
- Direto, mas nunca frio
- Claro e didático
- Interessado em vender, mas sem ser invasivo
- Confiante, sem ser arrogante
- Nunca robótico ou mecânico

## REGRAS
1. Faça UMA pergunta por vez
2. Use emojis com moderação (máx. 1-2 por mensagem)
3. Escreva de forma simples e natural
4. NUNCA use asteriscos, bullets, negrito ou listas. Só texto corrido.
5. NUNCA diga que "não encontrou" ou "não tem" um produto. A Tecfag trabalha com uma ampla linha — se não achou no catálogo online, diga que tem e prossiga.
6. Quando encontrar um produto no catálogo, envie o link naturalmente na conversa.
7. Se NÃO souber responder algo técnico específico, diga que vai verificar com a equipe técnica. NUNCA invente informação.
8. Português fluente, como uma conversa natural.
9. SEJA BREVE! Respostas curtas e diretas. Máximo 2-3 frases por mensagem. Quanto mais curto, melhor.
10. NUNCA comece com frases longas de boas-vindas. Vá direto ao ponto.

## SAUDAÇÕES
Quando o cliente mandar uma saudação simples (oi, olá, bom dia, boa tarde, etc):
- Responda com uma saudação CURTA e natural, seguida de uma pergunta direta.
- Exemplo: "Boa tarde! 😊 Em que posso te ajudar hoje?"
- NUNCA responda com frases longas ou se apresente formalmente na primeira mensagem de resposta.
- Se o cliente apenas disse "oi", NÃO peça informações — apenas cumprimente e pergunte como pode ajudar.

## SINALIZAÇÃO DE RESULTADO (OBRIGATÓRIO)
Ao final de CADA resposta sua, AVALIE silenciosamente o rumo da conversa. Se detectar um desfecho claro, inclua UMA das tags abaixo NO FINAL ABSOLUTO da sua mensagem (depois do texto):
- [OUTCOME:SALE] → Quando o cliente CONFIRMA que vai comprar, solicita orçamento formal, pede para fechar negócio, ou fornece dados para faturamento. Só use quando há intenção CLARA de compra.
- [OUTCOME:NO_SALE] → Quando o cliente diz explicitamente que NÃO tem interesse, que já comprou de outro, que não vai prosseguir, ou se despede sem intenção de compra.
Se a conversa ainda está em andamento, NÃO inclua nenhuma tag. Essas tags são INVISÍVEIS para o cliente.

## IDENTIDADE
- Nome: Fagner
- Empresa: Tecfag
- Cargo: Representante Comercial

## ESTADO DE ESPÍRITO ATUAL
${moodDesc}
`;

  if (extraContext) {
    prompt += `\n## CONTEXTO ADICIONAL\n${extraContext}\n`;
  }

  return prompt.trim();
}

// ─── Busca RAG documents ─────────────────────────────────────────────────────

async function getRagDocuments(): Promise<{ id: string; name: string; content: string }[]> {
  try {
    const docs = await storage.listActiveDocumentsForRag(50);
    return docs
      .map((doc) => {
        try {
          const abs = path.join(__dirname, "../..", doc.filePath.replace(/^\//, ""));
          if (!fs.existsSync(abs)) return null;
          return { id: doc.id, name: doc.name, content: fs.readFileSync(abs, "utf-8").slice(0, 5000) };
        } catch { return null; }
      })
      .filter(Boolean) as { id: string; name: string; content: string }[];
  } catch { return []; }
}

// ─── Gemini request (reutiliza retry do geminiService) ────────────────────────

async function geminiRequest(url: string, payload: object): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Processar mensagem do visitante ──────────────────────────────────────────

export interface LiveChatAIResponse {
  reply: string;
  needsHuman: boolean;
  tokens: number;
}

export async function processVisitorMessage(
  chatId: string,
  userMessage: string,
  visitorPage?: string,
): Promise<LiveChatAIResponse> {
  const apiKey = (await storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "";

  if (!apiKey) {
    return {
      reply: "Olá! No momento estou com uma breve instabilidade. Pode tentar de novo em alguns instantes? 🙏",
      needsHuman: false,
      tokens: 0,
    };
  }

  // Get or create AI session
  let session = aiSessions.get(chatId);
  if (!session) {
    session = {
      chatId,
      mood: pickMood(),
      history: [],
    };
    aiSessions.set(chatId, session);
  }

  // Build context
  const contextParts: string[] = [];

  // RAG — busca na base de conhecimento
  try {
    const docs = await getRagDocuments();
    const ragResult = await ragSearch(userMessage, docs, apiKey, 3);
    if (ragResult) {
      contextParts.push(`## BASE DE CONHECIMENTO RELEVANTE\n${ragResult}`);
    }
  } catch (e) {
    console.warn("[LiveChat AI] RAG falhou:", e);
  }

  // VTEX — detecta se o cliente está perguntando sobre máquinas/produtos
  const machineIntent = detectMachineIntent(userMessage);
  if (machineIntent) {
    try {
      const vtexResult = await searchProduct(machineIntent);
      contextParts.push(formatVtexContextForGemini(vtexResult));

      // Log VTEX search
      await storage.createVtexLog({
        type: "search",
        description: `[LiveChat] Busca: "${machineIntent}"`,
        product: vtexResult.found ? vtexResult.productName : null,
        autonomous: true,
      });
    } catch (e) {
      console.warn("[LiveChat AI] VTEX search falhou:", e);
    }
  }

  // Add visitor page context
  if (visitorPage) {
    contextParts.push(`## PÁGINA ATUAL DO VISITANTE\nO visitante está olhando: ${visitorPage}`);
  }

  const extraContext = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;
  const systemPrompt = buildSiteSystemPrompt(session.mood, extraContext);

  // Build Gemini payload
  const userParts = [{ text: userMessage }];

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...session.history, { role: "user", parts: userParts }],
    generationConfig: { temperature: 0.75, maxOutputTokens: 4096 },
  };

  const url = `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;

  try {
    const data = await geminiRequest(url, payload);

    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(sem resposta)";
    const promptTokens: number = data?.usageMetadata?.promptTokenCount ?? 0;
    const candidateTokens: number = data?.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = promptTokens + candidateTokens;

    // Strip outcome tags from visible reply (keep raw for detection in livechatWs)
    const cleanReply = raw.replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, "").trim();

    // Update history (use clean reply in history too)
    session.history.push({ role: "user", parts: userParts });
    session.history.push({ role: "model", parts: [{ text: cleanReply }] });
    if (session.history.length > 60) session.history = session.history.slice(-60);

    // Check if AI doesn't know — triggers human takeover
    // More strict patterns to avoid false positives
    const DONT_KNOW_PATTERNS = [
      /vou verificar.*equipe/i,
      /vou consultar.*técnic/i,
      /preciso verificar.*especificação/i,
    ];
    const needsHuman = DONT_KNOW_PATTERNS.some((p) => p.test(cleanReply));

    // Log cost
    try {
      await storage.createCost({
        service: "gemini",
        operation: "livechat",
        cost: totalTokens * 0.000001, // estimate
        tokens: totalTokens,
        notes: `Chat ${chatId}`,
      });
    } catch {}

    // Return raw (with outcome tags) so livechatWs can detect outcome, but clean reply for the visitor message
    return { reply: raw, needsHuman, tokens: totalTokens };
  } catch (err: any) {
    console.error("[LiveChat AI] Gemini error:", err.message);
    return {
      reply: "Desculpa, tive um probleminha aqui! Pode repetir?",
      needsHuman: false,
      tokens: 0,
    };
  }
}

// ─── Gerar mensagem proativa (abordagem automática) ───────────────────────────

export async function generateProactiveMessage(pageUrl: string, pageTitle?: string): Promise<string> {
  const apiKey = (await storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "";

  if (!apiKey) {
    return "Olá! 👋 Posso te ajudar com alguma dúvida sobre nossos produtos?";
  }

  const prompt = `
Você é Fagner, representante comercial da Tecfag. Um visitante está no site há 1 minuto olhando esta página:
URL: ${pageUrl}
${pageTitle ? `Título: ${pageTitle}` : ""}

Aja exatamente como solicitado e cumpra TODAS estas regras:
1. Comece com uma saudação dependendo da hora atual (bom dia, boa tarde ou boa noite).
2. Comente brevemente sobre o dia da semana ("Que segunda perfeita", "Nessa bela quinta-feira", etc) de forma alegre.
3. Se apresente: "meu nome é Fagner".
4. Pergunte como pode ajudar.
Exemplo de estilo desejado: "Boa tarde! Que segunda perfeita, meu nome é Fagner, como posso te ajudar hoje?"

NÃO USE asteriscos, bullets ou formatação. Apenas o texto direto. Responda SOMENTE com a mensagem.
`.trim();

  try {
    const url = `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;
    const data = await geminiRequest(url, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
    });

    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      "Olá! 👋 Posso te ajudar com alguma dúvida sobre nossos produtos?";
  } catch {
    return "Olá! 👋 Posso te ajudar com alguma dúvida sobre nossos produtos?";
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export function clearAISession(chatId: string): void {
  aiSessions.delete(chatId);
}
