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
import { processVisitorMessage, generateProactiveMessage, clearAISession, generateConversationNote } from "./livechatAI.js";
import { recalculateVisitorCategory } from "./livechatScoring.js";

// ─── Connection maps ─────────────────────────────────────────────────────────

interface VisitorConnection {
  ws: WebSocket;
  visitorId: string;
  chatId?: string;
  proactiveTimer?: NodeJS.Timeout;
}

interface AgentConnection {
  ws: WebSocket;
  userId: string;
}

const visitorConnections = new Map<string, VisitorConnection>();
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
      
      const msg = "Ainda posso ajudar com algo? Nosso atendimento é humanizado, fique à vontade para perguntar.";
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

// ─── Send to visitor ──────────────────────────────────────────────────────────

function sendToVisitor(visitorId: string, data: object): void {
  const conn = visitorConnections.get(visitorId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(data));
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
  const conn = visitorConnections.get(visitorId);
  if (!conn) return;

  // Clear existing timer
  if (conn.proactiveTimer) clearTimeout(conn.proactiveTimer);

  // Get configured delay (default 60s)
  const delaySetting = await lcStorage.getSettingParsed<number>("proactive_delay_ms");
  const delay = delaySetting ?? 60_000;

  // Check if proactive is enabled
  const enabled = await lcStorage.getSettingParsed<boolean>("proactive_enabled");
  if (enabled === false) return;

  conn.proactiveTimer = setTimeout(async () => {
    try {
      // Don't send if visitor already has an active chat
      const existingChat = await lcStorage.getActiveChatByVisitor(visitorId);
      if (existingChat) return;

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

      // Update connection
      conn.chatId = chat.id;

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

            // Store connection
            visitorConnections.set(visitorId, { ws, visitorId });

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

          // ── VISITOR: Chat message ─────────────────────────────────
          case "CHAT_MESSAGE": {
            if (!visitorId) break;

            // Get or create chat with Mutex protection against race conditions
            let chat: any = null;
            if (chatCreationLocks.has(visitorId)) {
                chat = await chatCreationLocks.get(visitorId);
            } else {
              chat = await lcStorage.getActiveChatByVisitor(visitorId);
              if (!chat) {
                const createPromise = (async () => {
                  const newChat = await lcStorage.createChat({
                    visitorId,
                    source: "widget",
                    visitorName: data.visitorName,
                  });

                  // Engagement: +20 for starting chat
                  const v = await lcStorage.getVisitorById(visitorId);
                  if (v) {
                    await lcStorage.updateVisitor(visitorId, {
                      engagementScore: Math.min((v.engagementScore ?? 0) + 20, 100),
                    });
                    await recalculateVisitorCategory(visitorId);
                  }
                  return newChat;
                })();
                
                chatCreationLocks.set(visitorId, createPromise);
                try {
                  chat = await createPromise;
                } finally {
                  chatCreationLocks.delete(visitorId);
                }
              }
            }

            // SEMPRE mover para em_atendimento quando visitante envia mensagem
            try {
              await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
              broadcastPipelineUpdate(visitorId, "em_atendimento");
            } catch {}

            const conn = visitorConnections.get(visitorId);
            if (conn) conn.chatId = chat.id;

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

            // If AI is handling this chat, buffer message and generate response after 5s
            if (chat.status === "ai_active" || chat.status === "waiting") {
              // Update status to ai_active
              await lcStorage.updateChat(chat.id, { status: "ai_active" });

              // Manage buffer
              let buffer = chatMessageBuffers.get(chat.id);
              if (buffer) {
                clearTimeout(buffer.timer);
                buffer.content.push(data.content);
              } else {
                buffer = { timer: null as any, content: [data.content] };
                chatMessageBuffers.set(chat.id, buffer);
              }

              // Show typing indicator to visitor
              sendToVisitor(visitorId, { type: "TYPING_START" });

              const currentVisitorId = visitorId as string;

              // Reset 5s timer
              buffer.timer = setTimeout(async () => {
                const combinedContent = chatMessageBuffers.get(chat.id)?.content.join("\n\n") || data.content;
                chatMessageBuffers.delete(chat.id);

                const visitor = await lcStorage.getVisitorById(currentVisitorId);
                const aiResponse = await processVisitorMessage(
                  chat.id,
                  combinedContent,
                  visitor?.currentPage ?? undefined,
                ) as any; // Allow isError

                if (aiResponse.isError) {
                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                  return; // Silent fail, do not send message
                }

                // Extração de Score e Limpeza de Tags
                const rawReply = aiResponse.reply;
                let finalScore = visitor?.engagementScore ?? 0;
                
                const scoreMatch = rawReply.match(/\[SCORE:(\d+)\]/i);
                if (scoreMatch) {
                  const botScore = parseInt(scoreMatch[1], 10);
                  finalScore = Math.min(botScore, 100);
                  try {
                    await lcStorage.updateVisitor(currentVisitorId, { engagementScore: finalScore });
                    await recalculateVisitorCategory(currentVisitorId);
                  } catch {}
                }

                // Remover TODAS as tags invísiveis antes de exibir ao cliente
                const cleanReply = rawReply
                  .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, "")
                  .replace(/\[SCORE:\d+\]/gi, "")
                  .trim();

                // Fatiar por pontução final para envio sequencial humanizado
                const chunks = cleanReply.split(/(?<=[.!?])\s+/).filter(Boolean);
                
                // Mestre de Marionete (Delay Natural)
                for (let i = 0; i < chunks.length; i++) {
                  const chunk = chunks[i].trim();
                  if (!chunk) continue;
                  
                  // A partir do 2º chunk: ativa Typing e aguarda um delay proporcional
                  if (i > 0) {
                     sendToVisitor(currentVisitorId, { type: "TYPING_START" });
                     const delayForReading = Math.min(Math.max(chunk.length * 35, 1200), 3500);
                     await new Promise(r => setTimeout(r, delayForReading));
                  }

                  sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });

                  // Salvar sub-mensagem
                  await lcStorage.createMessage({
                    chatId: chat.id,
                    sender: "ai",
                    content: chunk,
                  });

                  // Enviar resposta AI (chunk) para o visitante
                  sendToVisitor(currentVisitorId, {
                    type: "CHAT_REPLY",
                    chatId: chat.id,
                    sender: "ai",
                    content: chunk,
                    timestamp: new Date().toISOString(),
                  });

                  // Notificar agentes do painel
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
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "finalizado_com_venda");
                  const note = await generateConversationNote(chat.id);
                  if (note) await lcStorage.addVisitorNote(currentVisitorId, "Venda", note);
                  await lcStorage.closeChat(chat.id);
                  clearAISession(chat.id);
                  broadcastPipelineUpdate(currentVisitorId, "finalizado_com_venda");
                  broadcastToAgents({ type: "CHAT_CLOSED", chatId: chat.id });
                } else if (hasNoSale) {
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "finalizado_sem_venda");
                  const note = await generateConversationNote(chat.id);
                  if (note) await lcStorage.addVisitorNote(currentVisitorId, "Sem Venda", note);
                  await lcStorage.closeChat(chat.id);
                  clearAISession(chat.id);
                  broadcastPipelineUpdate(currentVisitorId, "finalizado_sem_venda");
                  broadcastToAgents({ type: "CHAT_CLOSED", chatId: chat.id });
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

            const stages = ['novo_atendimento', 'em_atendimento', 'finalizado_com_venda', 'finalizado_sem_venda', 'sem_resposta'];
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
        }
      } catch (err: any) {
        console.error("[LiveChat WS] Error:", err.message);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────
    ws.on("close", async () => {
      if (role === "visitor" && visitorId) {
        const conn = visitorConnections.get(visitorId);
        if (conn?.proactiveTimer) clearTimeout(conn.proactiveTimer);

        visitorConnections.delete(visitorId);
        await lcStorage.setVisitorOffline(visitorId);

        // If visitor had an active chat and disconnects, start follow up timeout
        const activeChat = await lcStorage.getActiveChatByVisitor(visitorId);
        if (activeChat) {
          startFollowUpTimers(visitorId, activeChat.id);
        }

        broadcastToAgents({
          type: "VISITOR_OFFLINE",
          visitorId,
        });
      }

      if (role === "agent") {
        agentConnections.delete(connectionId);
      }
    });
  });

  console.log("[LiveChat] ✅ WebSocket /ws/livechat inicializado");
}
