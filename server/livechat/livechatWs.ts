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
import { processVisitorMessage, generateProactiveMessage, clearAISession } from "./livechatAI.js";
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

// ─── Broadcast to all agents ──────────────────────────────────────────────────

function broadcastToAgents(data: object): void {
  const payload = JSON.stringify(data);
  Array.from(agentConnections.values()).forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  });
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

export function initLiveChatWs(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade — filter by path
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);

    if (url.pathname === "/ws/livechat") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Don't handle other paths — let existing WS handlers take them
  });

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

          // ── VISITOR: Chat message ─────────────────────────────────
          case "CHAT_MESSAGE": {
            if (!visitorId) break;

            // Get or create chat
            let chat = await lcStorage.getActiveChatByVisitor(visitorId);
            if (!chat) {
              chat = await lcStorage.createChat({
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
            }

            const conn = visitorConnections.get(visitorId);
            if (conn) conn.chatId = chat.id;

            // Save visitor message
            await lcStorage.createMessage({
              chatId: chat.id,
              sender: "visitor",
              content: data.content,
            });

            // Notify agents
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: chat.id,
              visitorId,
              sender: "visitor",
              content: data.content,
              timestamp: new Date().toISOString(),
            });

            // If AI is handling this chat, generate response
            if (chat.status === "ai_active" || chat.status === "waiting") {
              // Update status to ai_active
              await lcStorage.updateChat(chat.id, { status: "ai_active" });

              // Show typing indicator to visitor
              sendToVisitor(visitorId, { type: "TYPING_START" });

              const visitor = await lcStorage.getVisitorById(visitorId);
              const aiResponse = await processVisitorMessage(
                chat.id,
                data.content,
                visitor?.currentPage ?? undefined,
              );

              sendToVisitor(visitorId, { type: "TYPING_STOP" });

              // Save AI response
              await lcStorage.createMessage({
                chatId: chat.id,
                sender: "ai",
                content: aiResponse.reply,
              });

              // Send AI reply to visitor
              sendToVisitor(visitorId, {
                type: "CHAT_REPLY",
                chatId: chat.id,
                sender: "ai",
                content: aiResponse.reply,
                timestamp: new Date().toISOString(),
              });

              // Notify agents about AI reply
              broadcastToAgents({
                type: "CHAT_MESSAGE",
                chatId: chat.id,
                visitorId,
                sender: "ai",
                content: aiResponse.reply,
                timestamp: new Date().toISOString(),
              });

              // If AI needs human help
              if (aiResponse.needsHuman) {
                await lcStorage.updateChat(chat.id, { needsHuman: "true" });
                broadcastToAgents({
                  type: "NEEDS_HUMAN",
                  chatId: chat.id,
                  visitorId,
                  message: "Fagner precisa de ajuda nesta conversa!",
                });
              }
            }
            break;
          }

          // ── AGENT: Connect to monitoring ──────────────────────────
          case "AGENT_CONNECT": {
            role = "agent";
            agentConnections.set(connectionId, { ws, userId: data.userId });

            // Send current state
            const [visitors, chats, stats] = await Promise.all([
              lcStorage.listOnlineVisitors(),
              lcStorage.listChats(undefined, 50),
              lcStorage.getStats(),
            ]);

            ws.send(JSON.stringify({
              type: "INIT_STATE",
              visitors,
              chats,
              stats,
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
