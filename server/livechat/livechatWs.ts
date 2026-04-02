/**
 * server/livechat/livechatWs.ts
 *
 * WebSocket handler para o Live Chat — SEPARADO do Fagner
 * Namespace: /ws/livechat
 *
 * Gerencia:
 * - Conexões de visitantes do widget
 * - Conexões de agentes do painel admin
 * - Rastreamento de página em tempo real
 * - Abordagem proativa automática (timer 1 min)
 */

import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import { lcStorage } from "./livechatStorage.js";
import { processVisitorMessage, generateProactiveMessage, clearAISession, generateConversationNote, isObviousNoise, detectStageIntent, generatePosVendaReport } from "./livechatAI.js";
import { createPosVendaOS, isRdCrmConfigured } from "./rdCrmService.js";
import { recalculateVisitorCategory } from "./livechatScoring.js";

// ─── Connection maps ─────────────────────────────────────────────────────────

// Cada aba aberta pelo mesmo visitante gera uma entrada na Set
interface VisitorConnection {
  ws: WebSocket;
  connectionId: string;
}

interface AgentConnection {
  ws: WebSocket;
  userId: string;
}

// Map: visitorId → Set de conexões WebSocket (suporta múltiplas abas)
const visitorConnections = new Map<string, Set<VisitorConnection>>();
// Timers proativos separados (1 por visitante, independente do nº de abas)
const proactiveTimers = new Map<string, NodeJS.Timeout>();
const agentConnections = new Map<string, AgentConnection>();
interface FollowUpTimers {
  t3m?: NodeJS.Timeout;
  t8m?: NodeJS.Timeout;
  t10m?: NodeJS.Timeout;
}
const followUpTimers = new Map<string, FollowUpTimers>();

interface ChatMessageBuffer {
  timer: NodeJS.Timeout;
  content: string[];
}
const chatMessageBuffers = new Map<string, ChatMessageBuffer>();
const chatCreationLocks = new Map<string, Promise<any>>();

// ─── Send to visitor (all open tabs) ──────────────────────────────────────

function sendToVisitor(visitorId: string, payload: object): void {
  const conns = visitorConnections.get(visitorId);
  if (!conns) return;
  const msg = JSON.stringify(payload);
  Array.from(conns).forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
  });
}

// ─── Broadcast to all agents ──────────────────────────────────────────────────

function broadcastToAgents(data: object): void {
  const payload = JSON.stringify(data);
  Array.from(agentConnections.values()).forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  });
}

// ─── Broadcast pipeline update to agents ──────────────────────────────────────

async function broadcastPipelineUpdate(visitorId: string, stage: string): Promise<void> {
  const visitor = await lcStorage.getVisitorById(visitorId);
  broadcastToAgents({
    type: "PIPELINE_UPDATE",
    visitorId,
    stage,
    visitor,
  });
}

// ─── Follow-up Timers (3m, 8m, 10m limit) ────────────────────────────────────

function startFollowUpTimers(visitorId: string, chatId: string): void {
  clearFollowUpTimers(visitorId);
  const timers: FollowUpTimers = {};

  // 3 minutes follow-up
  timers.t3m = setTimeout(async () => {
    try {
      const chat = await lcStorage.getChatById(chatId);
      if (!chat || chat.status === "closed" || chat.status !== "ai_active") return;
      
      const msg = "Opa, você ainda está aí?";
      await lcStorage.createMessage({ chatId, sender: "ai", content: msg });
      sendToVisitor(visitorId, { type: "CHAT_REPLY", chatId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
      broadcastToAgents({ type: "CHAT_MESSAGE", chatId, visitorId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
    } catch (err: any) { console.error("[Timers] 3m err:", err.message); }
  }, 3 * 60 * 1000);

  // 8 minutes follow-up
  timers.t8m = setTimeout(async () => {
    try {
      const chat = await lcStorage.getChatById(chatId);
      if (!chat || chat.status === "closed" || chat.status !== "ai_active") return;
      
      const msg = "Ainda posso ajudar com algo? Qualquer dúvida é só falar! 😊";
      await lcStorage.createMessage({ chatId, sender: "ai", content: msg });
      sendToVisitor(visitorId, { type: "CHAT_REPLY", chatId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
      broadcastToAgents({ type: "CHAT_MESSAGE", chatId, visitorId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
    } catch (err: any) { console.error("[Timers] 8m err:", err.message); }
  }, 8 * 60 * 1000);

  // 10 minutes closure
  timers.t10m = setTimeout(async () => {
    try {
      const chat = await lcStorage.getChatById(chatId);
      if (chat && chat.status !== "closed") {
        await lcStorage.closeChat(chatId);
        await lcStorage.updateVisitorPipeline(visitorId, "sem_resposta");
        clearAISession(chatId);
        broadcastToAgents({ type: "CHAT_CLOSED", chatId });
        broadcastPipelineUpdate(visitorId, "sem_resposta");
        console.log(`[LiveChat] Visitante ${visitorId} movido para 'sem_resposta' (timeout 10min)`);
      }
    } catch (err: any) { console.error("[Timers] 10m err:", err.message); }
  }, 10 * 60 * 1000);

  followUpTimers.set(visitorId, timers);
}

function clearFollowUpTimers(visitorId: string): void {
  const timers = followUpTimers.get(visitorId);
  if (timers) {
    if (timers.t3m) clearTimeout(timers.t3m);
    if (timers.t8m) clearTimeout(timers.t8m);
    if (timers.t10m) clearTimeout(timers.t10m);
    followUpTimers.delete(visitorId);
  }
}


// ─── Detect traffic source ───────────────────────────────────────────────────

function detectSource(referrer?: string, utmSource?: string, utmMedium?: string): string {
  if (utmMedium === "cpc" || utmMedium === "ppc") return "google_ads";
  if (utmSource) return utmSource;
  if (!referrer) return "direct";
  const r = referrer.toLowerCase();
  if (r.includes("google.com")) return "google_organic";
  if (r.includes("instagram.com")) return "instagram";
  if (r.includes("facebook.com")) return "facebook";
  if (r.includes("youtube.com")) return "youtube";
  if (r.includes("tiktok.com")) return "tiktok";
  if (r.includes("linkedin.com")) return "linkedin";
  return "referral";
}

// ─── Detect browser ──────────────────────────────────────────────────────────

function detectBrowser(ua?: string): string {
  if (!ua) return "unknown";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR/")) return "Opera";
  return "other";
}

// ─── GeoIP (free API) ─────────────────────────────────────────────────────────

async function geoLookup(ip: string): Promise<{ city?: string; country?: string }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return {};
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return {};
    const data = await res.json() as any;
    return { city: data.city, country: data.country };
  } catch {
    return {};
  }
}

// ─── Proactive approach timer ─────────────────────────────────────────────────

async function startProactiveTimer(visitorId: string): Promise<void> {
  // Se já há um timer ativo para este visitante, não cria outro
  if (proactiveTimers.has(visitorId)) return;
  // Visitante deve ter ao menos uma conexão ativa
  if (!visitorConnections.has(visitorId)) return;

  // Get configured delay (default 60s)
  const delaySetting = await lcStorage.getSettingParsed<number>("proactive_delay_ms");
  const delay = delaySetting ?? 60_000;

  // Check if proactive is enabled
  const enabled = await lcStorage.getSettingParsed<boolean>("proactive_enabled");
  if (enabled === false) return;

  const timer = setTimeout(async () => {
    proactiveTimers.delete(visitorId);
    try {
      // Don't send if visitor already has an active chat
      const existingChat = await lcStorage.getActiveChatByVisitor(visitorId);
      if (existingChat) return;

      // Don't send if visitor had ANY chat in the last 24 hours
      const lastChat = await lcStorage.getLastChatByVisitor(visitorId);
      if (lastChat) {
        const hoursAgo24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (new Date(lastChat.startedAt) > hoursAgo24) {
          return;
        }
      }

      const visitor = await lcStorage.getVisitorById(visitorId);
      if (!visitor || visitor.isOnline !== "true") return;

      // Generate proactive message
      const message = await generateProactiveMessage(
        visitor.currentPage ?? "tecfag.com.br",
        visitor.currentPageTitle ?? undefined,
      );

      // Create chat and message
      const chat = await lcStorage.createChat({
        visitorId,
        source: "proactive",
        proactiveApproach: true,
      });

      await lcStorage.createMessage({
        chatId: chat.id,
        sender: "ai",
        content: message,
      });

      // Store chat reference (no conn object needed — use storage)
      // sendToVisitor already handles all open tabs

      // Send to visitor widget
      sendToVisitor(visitorId, {
        type: "PROACTIVE_MESSAGE",
        chatId: chat.id,
        message,
        timestamp: new Date().toISOString(),
      });

      // Notify agents
      broadcastToAgents({
        type: "NEW_CHAT",
        chat,
        visitor,
        proactive: true,
      });

      console.log(`[LiveChat] Abordagem proativa disparada para visitante ${visitorId}`);
    } catch (err: any) {
      console.error("[LiveChat] Erro na abordagem proativa:", err.message);
    }
  }, delay);
  proactiveTimers.set(visitorId, timer);
}

// ─── Init WebSocket server ────────────────────────────────────────────────────

export function initLiveChatWs(server: http.Server, externalWss?: WebSocketServer): void {
  // Usa o wss passado externamente (evita dois handlers 'upgrade' conflitantes no mesmo httpServer)
  // Se não for passado, cria o próprio (compatibilidade com código legado)
  const wss = externalWss ?? new WebSocketServer({ noServer: true });

  // Só registra o próprio upgrade handler se NÃO recebemos um wss externo
  if (!externalWss) {
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "", `http://${request.headers.host}`);
      if (url.pathname === "/ws/livechat") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    });
  }

  wss.on("connection", (ws, request) => {
    const connectionId = uuidv4();
    let role: "visitor" | "agent" | null = null;
    let visitorId: string | null = null;

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        switch (data.type) {

          // ── VISITOR: Initial handshake ─────────────────────────────
          case "VISITOR_CONNECT": {
            role = "visitor";
            const ip = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
              ?? request.socket.remoteAddress ?? "";
            const ua = request.headers["user-agent"] ?? "";
            const browser = detectBrowser(ua);
            const source = detectSource(data.referrer, data.utmSource, data.utmMedium);

            // Find or create visitor
            let visitor = await lcStorage.getVisitorByCookie(data.cookieId);

            if (visitor) {
              // Returning visitor
              await lcStorage.incrementVisitorVisits(visitor.id);
              visitor = await lcStorage.updateVisitor(visitor.id, {
                ip,
                browser,
                userAgent: ua,
                currentPage: data.currentPage,
                currentPageTitle: data.pageTitle,
                isOnline: "true",
                source: visitor.source ?? source,
              });
              visitorId = visitor!.id;
              await recalculateVisitorCategory(visitorId);

              // — Problema 4 (F5): Se há chat ativo mas não há sessão AI em memória,
              // significa que o cliente deu F5 (reconexão limpa). Fechamos o chat antigo
              // para que o próximo CHAT_MESSAGE crie um chat novo e fresco.
              try {
                const { hasAISession } = await import("./livechatAI.js");
                const existingChat = await lcStorage.getActiveChatByVisitor(visitorId);
                if (existingChat && !hasAISession(existingChat.id)) {
                  await lcStorage.closeChat(existingChat.id);
                  console.log(`[LiveChat] Visitante ${visitorId} reconectou sem sessão AI (F5) — chat ${existingChat.id} fechado, novo será criado.`);
                  broadcastToAgents({ type: "CHAT_STATUS", chatId: existingChat.id, status: "closed" });
                }
              } catch (e) {
                console.warn("[LiveChat] F5 check falhou:", e);
              }
            } else {
              // New visitor
              const geo = await geoLookup(ip);
              visitor = await lcStorage.createVisitor({
                cookieId: data.cookieId,
                ip,
                city: geo.city,
                country: geo.country,
                browser,
                userAgent: ua,
                currentPage: data.currentPage,
                currentPageTitle: data.pageTitle,
                source,
                utmSource: data.utmSource,
                utmMedium: data.utmMedium,
                utmCampaign: data.utmCampaign,
                referrer: data.referrer,
              });
              visitorId = visitor.id;
            }

            // Set pipeline stage to novo_atendimento for new/returning visitors
            if (visitor && !visitor.pipelineStage) {
              await lcStorage.updateVisitorPipeline(visitorId, "novo_atendimento");
            } else if (visitor && visitor.pipelineStage !== 'em_atendimento' && visitor.pipelineStage !== 'finalizado_com_venda') {
              await lcStorage.updateVisitorPipeline(visitorId, "novo_atendimento");
            }

            // Ensure isOnline is always set to true on reconnect
            await lcStorage.setVisitorOnline(visitorId);

            // Adicionar esta conexão à Set (suporta múltiplas abas do mesmo visitante)
            if (!visitorConnections.has(visitorId)) {
              visitorConnections.set(visitorId, new Set());
            }
            const myConn: VisitorConnection = { ws, connectionId };
            visitorConnections.get(visitorId)!.add(myConn);

            // Send acknowledgement
            ws.send(JSON.stringify({
              type: "CONNECTED",
              visitorId,
            }));

            // Notify agents
            broadcastToAgents({
              type: "VISITOR_ONLINE",
              visitor,
            });

            // Start proactive timer
            startProactiveTimer(visitorId);

            // Create initial pageview
            await lcStorage.createPageview({
              visitorId,
              url: data.currentPage ?? "",
              pageTitle: data.pageTitle,
            });
            await lcStorage.incrementVisitorPages(visitorId);

            break;
          }

          // ── VISITOR: Page navigation ──────────────────────────────
          case "PAGE_UPDATE": {
            if (!visitorId) break;
            await lcStorage.updateVisitor(visitorId, {
              currentPage: data.url,
              currentPageTitle: data.pageTitle,
            });
            await lcStorage.createPageview({
              visitorId,
              url: data.url,
              pageTitle: data.pageTitle,
            });
            await lcStorage.incrementVisitorPages(visitorId);

            // Add engagement points
            const visitor = await lcStorage.getVisitorById(visitorId);
            if (visitor) {
              let scoreBoost = 2; // +2 per page
              if (data.url?.includes("/contato") || data.url?.includes("/orcamento")) scoreBoost = 30;
              await lcStorage.updateVisitor(visitorId, {
                engagementScore: Math.min((visitor.engagementScore ?? 0) + scoreBoost, 100),
              });
              await recalculateVisitorCategory(visitorId);
            }

            broadcastToAgents({
              type: "VISITOR_PAGE_UPDATE",
              visitorId,
              url: data.url,
              pageTitle: data.pageTitle,
            });

            // Reset proactive timer
            startProactiveTimer(visitorId);
            break;
          }

          // ── VISITOR: Scroll/time update ───────────────────────────
          case "HEARTBEAT": {
            if (!visitorId) break;
            await lcStorage.updateVisitor(visitorId, { lastSeenAt: new Date().toISOString() } as any);

            // Update time on page for time engagement
            const v = await lcStorage.getVisitorById(visitorId);
            if (v) {
              const sessionAge = (Date.now() - new Date(v.firstSeenAt).getTime()) / 1000;
              if (sessionAge > 180) { // 3+ min on site
                await lcStorage.updateVisitor(visitorId, {
                  engagementScore: Math.min((v.engagementScore ?? 0) + 1, 100),
                });
                await recalculateVisitorCategory(visitorId);
              }
            }
            break;
          }

          // ── VISITOR: Set name ─────────────────────────────────────
          case "SET_VISITOR_NAME": {
            if (!visitorId || !data.name) break;

            // Persistir nome no registro do visitante
            try { await lcStorage.setVisitorName(visitorId, data.name); } catch {}

            const chat = await lcStorage.getActiveChatByVisitor(visitorId);
            if (chat) {
              await lcStorage.updateChat(chat.id, { visitorName: data.name });
              chat.visitorName = data.name;
              const visitor = await lcStorage.getVisitorById(visitorId);

              broadcastToAgents({
                type: "NEW_CHAT",
                chat,
                visitor,
                proactive: false,
              });
            }

            // Mover pipeline para Em Atendimento quando visitante fornece o nome
            try {
              await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
              broadcastPipelineUpdate(visitorId, "em_atendimento");
            } catch {}
            break;
          }

          // ── VISITOR: Restart chat ─────────────────────────────────
          case "RESTART_CHAT": {
            if (!visitorId) break;
            const chatToClose = await lcStorage.getActiveChatByVisitor(visitorId);
            if (chatToClose) {
              await lcStorage.closeChat(chatToClose.id);
              clearAISession(chatToClose.id);
              broadcastToAgents({
                type: "CHAT_STATUS",
                chatId: chatToClose.id,
                status: "closed",
              });
            }
            break;
          }

          // ── VISITOR: Chat message ─────────────────────────────────
          case "CHAT_MESSAGE": {
            if (!visitorId) break;

            // Get or create chat — proteção real contra race conditions
            // O lock fica ativo até o chat existir no banco, evitando chats duplicados
            let chat: any = null;

            // Checa se já há uma promise de criação em andamento
            const existingLock = chatCreationLocks.get(visitorId);
            if (existingLock) {
              chat = await existingLock;
            } else {
              // Busca chat ativo primeiro
              chat = await lcStorage.getActiveChatByVisitor(visitorId);
              if (!chat) {
                // Criar lock ANTES de iniciar a promise para bloquear chamadas paralelas
                let resolveLock!: (c: any) => void;
                const lockPromise = new Promise<any>(res => { resolveLock = res; });
                chatCreationLocks.set(visitorId, lockPromise);

                try {
                  const newChat = await lcStorage.createChat({
                    visitorId,
                    source: "widget",
                    visitorName: data.visitorName,
                  });

                  // Engajamento +20 por iniciar chat
                  const v = await lcStorage.getVisitorById(visitorId);
                  if (v) {
                    await lcStorage.updateVisitor(visitorId, {
                      engagementScore: Math.min((v.engagementScore ?? 0) + 20, 100),
                    });
                    await recalculateVisitorCategory(visitorId);
                  }

                  chat = newChat;
                  resolveLock(chat); // libera quem estava esperando
                } catch (err) {
                  resolveLock(null as any);
                  throw err;
                } finally {
                  // Remove lock após pequeno delay para que leitores concorrentes recebam o chat
                  setTimeout(() => chatCreationLocks.delete(visitorId!), 500);
                }
              }
            }

            if (!chat) break; // Falha na criação — abortar

            // SEMPRE mover para em_atendimento quando visitante envia mensagem
            try {
              await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
              broadcastPipelineUpdate(visitorId, "em_atendimento");
            } catch {}

            // chatId não precisa ser armazenado na conexão — é obtido via storage quando necessário

            // Save visitor message
            await lcStorage.createMessage({
              chatId: chat.id,
              sender: "visitor",
              content: data.content,
            });

            // Clear no-response timer (visitor responded)
            clearFollowUpTimers(visitorId);

            // Notify agents
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: chat.id,
              visitorId,
              sender: "visitor",
              content: data.content,
              timestamp: new Date().toISOString(),
            });

            // Se a IA está conduzindo, bufferiza até 5s de silêncio antes de responder
            if (chat.status === "ai_active" || chat.status === "waiting") {
              await lcStorage.updateChat(chat.id, { status: "ai_active" });

              // Gerenciar buffer de mensagens (debounce de 5s)
              let buffer = chatMessageBuffers.get(chat.id);
              if (buffer) {
                clearTimeout(buffer.timer);
                buffer.content.push(data.content);
              } else {
                buffer = { timer: null as any, content: [data.content] };
                chatMessageBuffers.set(chat.id, buffer);
              }

              // NÃO mostrar typing ainda — só após os 5s de respeit de mensagem
              const currentVisitorId = visitorId as string;

              // Timer de 5s: só processa quando o cliente pára de digitar
              buffer.timer = setTimeout(async () => {
                const combinedContent = chatMessageBuffers.get(chat.id)?.content.join("\n\n") || data.content;
                chatMessageBuffers.delete(chat.id);

                // Melhoria 3: verifica ruído ANTES de chamar IA — resposta instantânea, sem tokens
                const noiseCheck = isObviousNoise(combinedContent);
                if (noiseCheck.isNoise) {
                  console.log(`[LiveChat Noise] Ruído interceptado: "${combinedContent.slice(0, 50)}"`);
                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                  await lcStorage.createMessage({ chatId: chat.id, sender: "ai", content: noiseCheck.reply });
                  lcStorage.incrementChatNoiseFiltered(chat.id).catch(() => {});
                  sendToVisitor(currentVisitorId, { type: "CHAT_REPLY", chatId: chat.id, sender: "ai", content: noiseCheck.reply, timestamp: new Date().toISOString() });
                  broadcastToAgents({ type: "CHAT_MESSAGE", chatId: chat.id, visitorId: currentVisitorId, sender: "ai", content: noiseCheck.reply, timestamp: new Date().toISOString() });
                  startFollowUpTimers(currentVisitorId, chat.id);
                  return;
                }

                // Só AGORA mostra o indicador de digitação
                sendToVisitor(currentVisitorId, { type: "TYPING_START" });

                // Nome automático para o chat baseado na 1ª mensagem do cliente
                try {
                  const chatNow = await lcStorage.getChatById(chat.id);
                  if (chatNow && !chatNow.visitorName) {
                    const cleanFirstMsg = combinedContent.replace(/\[Anexo_Cliente:\s*[^\]]+\]/g, '📎 Anexo').trim();
                    const firstMsg = cleanFirstMsg.slice(0, 60) || "📎 Anexo";
                    const chatLabel = firstMsg.length > 40
                      ? firstMsg.slice(0, 40) + "..."
                      : firstMsg;
                    await lcStorage.updateChat(chat.id, { visitorName: chatLabel });
                  }
                } catch {}

                const visitor = await lcStorage.getVisitorById(currentVisitorId);
                let aiResponse: any;

                try {
                  aiResponse = await processVisitorMessage(
                    chat.id,
                    combinedContent,
                    visitor?.currentPage ?? undefined,
                    visitor?.name ?? undefined,
                  ) as any;
                } catch (err: any) {
                  console.error(`[LiveChat AI] ❌ ERRO CRÍTICO no processVisitorMessage:`, err);
                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                  return; // Falha interrompe o fluxo mas não trava o frontend
                }

                if (aiResponse.isError) {
                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                  return; // Falha silenciosa
                }

                // Extrair score (regex com escape simples correto)
                const rawReply = aiResponse.reply;
                let finalScore = visitor?.engagementScore ?? 0;

                const scoreMatch = rawReply.match(/\[SCORE:(\d+)\]/i);
                if (scoreMatch) {
                  const botScore = parseInt(scoreMatch[1], 10);
                  finalScore = Math.min(botScore, 100);
                  try {
                    await lcStorage.updateVisitor(currentVisitorId, { engagementScore: finalScore });
                    // Melhoria 1: salva score também no chat para o painel
                    await lcStorage.updateChatEngagement(chat.id, finalScore);
                    await recalculateVisitorCategory(currentVisitorId);
                  } catch {}
                }

                // Remover todas as tags invisíveis antes de exibir ao cliente
                const cleanReply = rawReply
                  .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, "")
                  .replace(/\[SCORE:\d+\]/gi, "")
                  .replace(/\[PRODUTO_IDENTIFICADO:[^\]]+\]/gi, "")
                  .trim();

                // ─── Pré-processa: garante que URLs fiquem em parágrafos próprios ─────────
                const processedReply = cleanReply
                  .replace(/(https?:\/\/[^\s)]+)/gi, "\n\n$1\n\n")
                  .replace(/(\/uploads\/[^\s)]+)/gi, "\n\n$1\n\n")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();

                // Separa emojis no final das frases e quebra por pontuação
                // Prioridade: parágrafos (\n\n) > pontuação (. ! ?)
                // REGRA: emojis NUNCA ficam em balões solo — ficam na última frase de texto
                function splitIntoChunks(text: string): string[] {
                  // Regex de emoji: detecta blocos contendo só emojis (pares surrogate + faixa BMP de emojis)
                  // Cobre: emojis SMP (pares surrogate \uD800-\uDFFF), símbolos \u2600-\u27BF,
                  //        estrelas \u2B50\u2B55, fe0f (variation selector), combining enclosing keycap
                  const EMOJI_ONLY_RE = /^[\uD800-\uDFFF\u2600-\u27BF\u2B50\u2B55\uFE0F\u20E3\s]+$/;
                  const TRAILING_EMOJI_RE = /\s+([\uD800-\uDFFF\u2600-\u27BF\uFE0F\u20E3]+)$/;

                  // 1. Divide por parágrafos (\n\n) — URLs ficam sozinhas aqui
                  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
                  
                  const result: string[] = [];
                  
                  for (const para of paragraphs) {
                    // Se for URL ou caminho de arquivo — manda como chunk avulso
                    if (para.startsWith("http") || para.startsWith("/uploads/")) {
                      result.push(para);
                      continue;
                    }

                    // Se for SOMENTE emoji(s) — funde com o último chunk em vez de criar novo balão
                    if (EMOJI_ONLY_RE.test(para)) {
                      if (result.length > 0) {
                        result[result.length - 1] = result[result.length - 1] + " " + para.trim();
                      }
                      // Se não há chunk anterior, descarta — evita balão de emoji social no início
                      continue;
                    }
                    
                    // Parágrafo curto (< 60 chars) — manda direto
                    if (para.length < 60) {
                      result.push(para);
                      continue;
                    }
                    
                    // 2. Para textos longos, divide por frases dentro do parágrafo
                    let remaining = para.trim();
                    while (remaining.length > 0) {
                      const matchIdx = remaining.search(/[.!?]\s+/);
                      if (matchIdx === -1) {
                        result.push(remaining.trim());
                        break;
                      }
                      const sentence = remaining.slice(0, matchIdx + 1).trim();
                      if (sentence) result.push(sentence);
                      remaining = remaining.slice(matchIdx + 1).trim();
                    }
                  }

                  // 3. Pós-processamento: se algum chunk ficou apenas com emoji(s), funde com o anterior
                  const final: string[] = [];
                  for (const chunk of result) {
                    if (EMOJI_ONLY_RE.test(chunk) && final.length > 0) {
                      final[final.length - 1] = final[final.length - 1] + " " + chunk.trim();
                    } else {
                      final.push(chunk);
                    }
                  }

                  return final.filter(Boolean);
                }

                const chunks = splitIntoChunks(processedReply);

                // Envio sequencial com delay natural (simula digitação humana)
                for (let i = 0; i < chunks.length; i++) {
                  const chunk = chunks[i];
                  if (!chunk) continue;

                  // A partir do 2º chunk: ativa Typing e aguarda
                  if (i > 0) {
                    sendToVisitor(currentVisitorId, { type: "TYPING_START" });
                    // Calcula delay pelo tamanho do texto (mínimo 800ms)
                    const delayMs = Math.min(Math.max(chunk.length * 35, 800), 3500);
                    await new Promise(r => setTimeout(r, delayMs));
                  }

                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });

                  await lcStorage.createMessage({
                    chatId: chat.id,
                    sender: "ai",
                    content: chunk,
                  });

                  sendToVisitor(currentVisitorId, {
                    type: "CHAT_REPLY",
                    chatId: chat.id,
                    sender: "ai",
                    content: chunk,
                    timestamp: new Date().toISOString(),
                  });

                  broadcastToAgents({
                    type: "CHAT_MESSAGE",
                    chatId: chat.id,
                    visitorId: currentVisitorId,
                    sender: "ai",
                    content: chunk,
                    timestamp: new Date().toISOString(),
                  });
                }

                // If AI needs human help
                if (aiResponse.needsHuman) {
                  await lcStorage.updateChat(chat.id, { needsHuman: "true" });
                  broadcastToAgents({
                    type: "NEEDS_HUMAN",
                    chatId: chat.id,
                    visitorId: currentVisitorId,
                    message: "Fagner precisa de ajuda nesta conversa!",
                  });
                }

                // Detectar desfecho usando rawReply (ainda contém as tags originais)
                const hasSale = /\[OUTCOME:SALE\]/i.test(rawReply);
                const hasNoSale = /\[OUTCOME:NO_SALE\]/i.test(rawReply);

                if (hasSale) {
                  // Gerar nota ANTES de limpar a sessão
                  const note = await generateConversationNote(chat.id);
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "finalizado_com_venda");
                  if (note) await lcStorage.addVisitorNote(currentVisitorId, "Venda", note);
                  await lcStorage.closeChat(chat.id);
                  clearAISession(chat.id);
                  broadcastPipelineUpdate(currentVisitorId, "finalizado_com_venda");
                  broadcastToAgents({ type: "CHAT_CLOSED", chatId: chat.id });
                } else if (hasNoSale) {
                  // Gerar nota ANTES de limpar a sessão
                  const note = await generateConversationNote(chat.id);
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "finalizado_sem_venda");
                  if (note) await lcStorage.addVisitorNote(currentVisitorId, "Sem Venda", note);
                  await lcStorage.closeChat(chat.id);
                  clearAISession(chat.id);
                  broadcastPipelineUpdate(currentVisitorId, "finalizado_sem_venda");
                  broadcastToAgents({ type: "CHAT_CLOSED", chatId: chat.id });
                }

                // ── Detectar tags de estágio [STAGE:...] ──
                const stageTagMatch = rawReply.match(/\[STAGE:(pos_venda|outros)\]/i);
                if (stageTagMatch) {
                  const newStage = stageTagMatch[1].toLowerCase() as string;
                  await lcStorage.updateVisitorPipeline(currentVisitorId, newStage);
                  broadcastPipelineUpdate(currentVisitorId, newStage);
                  console.log(`[LiveChat] Visitante ${currentVisitorId} movido para '${newStage}' via tag do Fagner`);
                } else {
                  // Fallback: detecção por regex na mensagem do USUÁRIO (para capturar intenção não marcada pelo Gemini)
                  const intentFromUserMsg = detectStageIntent(combinedContent);
                  if (intentFromUserMsg) {
                    await lcStorage.updateVisitorPipeline(currentVisitorId, intentFromUserMsg);
                    broadcastPipelineUpdate(currentVisitorId, intentFromUserMsg);
                    console.log(`[LiveChat] Visitante ${currentVisitorId} movido para '${intentFromUserMsg}' via regex na mensagem do user`);
                  }
                }

                // ── Detectar tag de dados de pós venda [POS_VENDA_DADOS:{...}] ──
                const posVendaTagMatch = rawReply.match(/\[POS_VENDA_DADOS:([\s\S]*?)\]/);
                if (posVendaTagMatch) {
                  try {
                    const posVendaData = JSON.parse(posVendaTagMatch[1].trim());
                    await lcStorage.updateVisitorPosVendaData(currentVisitorId, {
                      nome:        posVendaData.nome        ?? null,
                      telefone:    posVendaData.telefone    ?? null,
                      email:       posVendaData.email       ?? null,
                      cnpjCpf:     posVendaData.cnpjCpf     ?? null,
                      notaPedido:  posVendaData.notaPedido  ?? null,
                      problema:    posVendaData.problema    ?? null,
                    });
                    // Atualiza para pos_venda se ainda não estiver
                    await lcStorage.updateVisitorPipeline(currentVisitorId, "pos_venda");
                    broadcastPipelineUpdate(currentVisitorId, "pos_venda");
                    // Notifica painel para atualizar o modal do visitante
                    broadcastToAgents({
                      type: "VISITOR_POS_VENDA_UPDATED",
                      visitorId: currentVisitorId,
                      posVendaData,
                    });
                    console.log(`[LiveChat] Dados de pós venda salvos para visitante ${currentVisitorId}`);

                    // ── Criar OS no RD Station CRM (background, não bloqueia o chat) ──
                    if (isRdCrmConfigured()) {
                      (async () => {
                        try {
                          // Coletar snippet das últimas mensagens para enriquecer o relatório
                          const recentMessages = await lcStorage.listMessages(chatId ?? "", 10);
                          const snippet = recentMessages
                            .slice(-6)
                            .map(m => `${m.sender === 'visitor' ? 'Cliente' : 'Fagner'}: ${m.content.slice(0, 150)}`)
                            .join('\n');

                          // Gerar relatório via Gemini
                          const relatorio = await generatePosVendaReport({
                            nome:        posVendaData.nome,
                            telefone:    posVendaData.telefone,
                            email:       posVendaData.email       ?? null,
                            cnpjCpf:     posVendaData.cnpjCpf     ?? null,
                            notaPedido:  posVendaData.notaPedido  ?? null,
                            problema:    posVendaData.problema,
                            conversationSnippet: snippet,
                          });

                          // Criar OS no RD CRM
                          const dealId = await createPosVendaOS(
                            currentVisitorId,
                            {
                              nome:       posVendaData.nome,
                              telefone:   posVendaData.telefone,
                              email:      posVendaData.email       ?? undefined,
                              cnpjCpf:    posVendaData.cnpjCpf     ?? undefined,
                              notaPedido: posVendaData.notaPedido  ?? undefined,
                              problema:   posVendaData.problema,
                            },
                            relatorio
                          );

                          // Notificar painel admin com o link da OS criada
                          broadcastToAgents({
                            type: "RD_CRM_OS_CREATED",
                            visitorId: currentVisitorId,
                            dealId,
                            dealUrl: `https://app.rdstation.com.br/crm/deals/${dealId}`,
                          });

                          console.log(`[RD CRM] ✅ OS criada no RD CRM para visitante ${currentVisitorId}: ${dealId}`);
                        } catch (crmErr: any) {
                          console.error(`[RD CRM] ❌ Falha ao criar OS:`, crmErr.message);
                        }
                      })();
                    } else {
                      console.log("[RD CRM] Integração desativada (variáveis de ambiente não configuradas).");
                    }
                  } catch (parseErr: any) {
                    console.warn("[LiveChat] Falha ao parsear POS_VENDA_DADOS:", parseErr.message);
                  }
                }

                // Start follow-ups (3m, 8m, 10m)
                startFollowUpTimers(currentVisitorId, chat.id);
              }, 5000); // 5 sec cooldown
            }
            break;
          }

          // ── AGENT: Connect to monitoring ──────────────────────────
          case "AGENT_CONNECT": {
            role = "agent";
            agentConnections.set(connectionId, { ws, userId: data.userId });

            // Migrar visitantes com pipelineStage null (criados antes do fix)
            try {
              await lcStorage.migrateNullPipelineStages();
            } catch {}

            // Envia todos os visitantes recentes (não só online) para popular o painel
            const [visitors, chats, stats] = await Promise.all([
              lcStorage.listAllVisitors(200),
              lcStorage.listChats(undefined, 100),
              lcStorage.getStats(),
            ]);

            const stages = ['novo_atendimento', 'em_atendimento', 'pos_venda', 'finalizado_com_venda', 'finalizado_sem_venda', 'outros', 'sem_resposta'];
            const pipeline: Record<string, any[]> = {};
            for (const stage of stages) {
              pipeline[stage] = await lcStorage.listVisitorsByPipeline(stage);
            }

            ws.send(JSON.stringify({
              type: "INIT_STATE",
              visitors,
              chats,
              stats,
              pipeline,
            }));
            break;
          }

          // ── AGENT: Send message (human takeover) ──────────────────
          case "AGENT_MESSAGE": {
            const chat = await lcStorage.getChatById(data.chatId);
            if (!chat) break;

            // Update chat status to human
            await lcStorage.updateChat(chat.id, {
              status: "human_active",
              agentId: data.userId,
              needsHuman: "false",
            });

            // Save agent message
            await lcStorage.createMessage({
              chatId: chat.id,
              sender: "agent",
              content: data.content,
            });

            // Send to visitor
            sendToVisitor(chat.visitorId, {
              type: "CHAT_REPLY",
              chatId: chat.id,
              sender: "agent",
              content: data.content,
              timestamp: new Date().toISOString(),
            });

            // Broadcast to other agents
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: chat.id,
              visitorId: chat.visitorId,
              sender: "agent",
              agentId: data.userId,
              content: data.content,
              timestamp: new Date().toISOString(),
            });
            break;
          }

          // ── AGENT: Flag Attention ─────────────────────────────────
          case "FLAG_ATTENTION": {
            const chatToFlag = await lcStorage.getChatById(data.chatId);
            if (!chatToFlag) break;
            
            const moodScore = data.attentionObs ? `${data.attentionReason}: ${data.attentionObs}` : data.attentionReason;
            await lcStorage.updateChat(chatToFlag.id, {
              needsHuman: "attention",
              mood: moodScore,
            });

            // Optionally notify other agents so their dashboards update in real-time
            broadcastToAgents({
              type: "CHAT_FLAGGED",
              chatId: chatToFlag.id,
              needsHuman: "attention",
              mood: moodScore
            });
            break;
          }

          // ── AGENT: Close chat ─────────────────────────────────────
          case "CLOSE_CHAT": {
            const chatToClose = await lcStorage.getChatById(data.chatId);
            if (!chatToClose) break;

            await lcStorage.closeChat(chatToClose.id);
            clearAISession(chatToClose.id);

            sendToVisitor(chatToClose.visitorId, {
              type: "CHAT_CLOSED",
              chatId: chatToClose.id,
            });

            broadcastToAgents({
              type: "CHAT_CLOSED",
              chatId: chatToClose.id,
            });
            break;
          }

          // ── AGENT: Take over from AI ──────────────────────────────
          case "TAKE_OVER": {
            const chatToTake = await lcStorage.getChatById(data.chatId);
            if (!chatToTake) break;

            await lcStorage.updateChat(chatToTake.id, {
              status: "human_active",
              agentId: data.userId,
              needsHuman: "false",
            });

            broadcastToAgents({
              type: "CHAT_TAKEN_OVER",
              chatId: chatToTake.id,
              agentId: data.userId,
            });
            break;
          }

          // ── AGENT: Return chat to AI (devolve para o Fagner) ─────────
          case "RETURN_TO_AI": {
            const chatToReturn = await lcStorage.getChatById(data.chatId);
            if (!chatToReturn) break;

            await lcStorage.updateChat(chatToReturn.id, {
              status: "ai_active",
              agentId: null as any,
              needsHuman: "false",
            });

            broadcastToAgents({
              type: "CHAT_RETURNED_TO_AI",
              chatId: chatToReturn.id,
            });

            console.log(`[LiveChat] Chat ${chatToReturn.id} devolvido ao Fagner pelo agente.`);
            break;
          }
        }
      } catch (err: any) {
        console.error("[LiveChat WS] Error:", err.message);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────
    ws.on("close", async () => {
      if (role === "visitor" && visitorId) {
        const conns = visitorConnections.get(visitorId);
        if (conns) {
          // Remove apenas esta conexão da Set
          Array.from(conns).forEach((c) => { if (c.ws === ws) conns.delete(c); });

          // Só marca offline quando NÃO há mais nenhuma aba aberta
          if (conns.size === 0) {
            visitorConnections.delete(visitorId);
            // Limpar timer proativo
            const pt = proactiveTimers.get(visitorId);
            if (pt) { clearTimeout(pt); proactiveTimers.delete(visitorId); }

            await lcStorage.setVisitorOffline(visitorId);

            // Se havia chat ativo, iniciar timers de follow-up
            const activeChat = await lcStorage.getActiveChatByVisitor(visitorId);
            if (activeChat) startFollowUpTimers(visitorId, activeChat.id);

            broadcastToAgents({ type: "VISITOR_OFFLINE", visitorId });
          }
        }
      }

      if (role === "agent") {
        agentConnections.delete(connectionId);
      }
    });
  });

  console.log("[LiveChat] ✅ WebSocket /ws/livechat inicializado");
}
