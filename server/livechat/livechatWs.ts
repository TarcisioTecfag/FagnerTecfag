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
import db from "../db.js";
import { sql } from "drizzle-orm";
import { processVisitorMessage, generateProactiveMessage, clearAISession, generateConversationNote, generateProgressiveNote, isObviousNoise, detectStageIntent, generatePosVendaReport, generateMaquinasReport, generatePecasReport, setProductContext, cancelGeneration } from "./livechatAI.js";
import { createPosVendaOS, createMaquinasOS, createPecasOS, isRdCrmConfigured } from "./rdCrmService.js";
import { recalculateVisitorCategory } from "./livechatScoring.js";
import { buildCart } from "./vtexCheckoutService.js";
import type { VtexOrderData } from "./vtexCheckoutService.js";
import { getProductBySlug, formatProductContextForAI } from "./vtexCatalogService.js";
import { resolvePageIntent } from "./livechatIntentResolver.js";

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

// Set de chatIds atualmente com IA processando — impede race condition de múltiplos timers
// paralelos (Fagner "conversando sozinho" durante outages lentos do Gemini)
const chatsBeingProcessed = new Set<string>();

// ─── Contador de mensagens do visitante por chat (para notas progressivas a cada 5) ─
const visitorMsgCounters = new Map<string, number>();

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

// Exportada para uso nas rotas REST (drag & drop manual de cards)
export async function broadcastPipelineUpdateExternal(visitorId: string, stage: string): Promise<void> {
  return broadcastPipelineUpdate(visitorId, stage);
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

      // ── 🛡️ FALLBACK DE OVERVIEW PENDENTE ─────────────────────────────────────
      // Se o visitante está em estágio maquinas/pecas/pos_venda, ainda não tem deal CRM
      // e o último AI message parece ser um OVERVIEW aguardando confirmação que o cliente
      // não respondeu → cria o card automaticamente com os dados já salvos no banco.
      // Isso resolve o caso: "cliente respondeu tudo mas não confirmou o resumo"
      const visitorForOverview = await lcStorage.getVisitorById(visitorId).catch(() => null);
      const overviewStages = ['maquinas', 'pecas', 'pos_venda'];
      if (
        visitorForOverview &&
        overviewStages.includes(visitorForOverview.pipelineStage ?? '') &&
        !visitorForOverview.rdCrmDealId &&
        isRdCrmConfigured()
      ) {
        // Verifica se o último AI message é um OVERVIEW aguardando confirmação
        const recentMsgs = await lcStorage.listMessagesByChat(chatId).catch(() => [] as any[]);
        const lastAiMsg = [...recentMsgs].reverse().find((m: any) => m.sender === 'ai');
        // Expansão da regex: o Fagner às vezes diz "Estão corretos?", "Está tudo certo?", etc.
        const isOverviewPending = lastAiMsg && /est[áão] (tudo )?correto|confirme os dados|resumo|est[áão] corretos\?/i.test(lastAiMsg.content);

        if (isOverviewPending) {
          const stage = visitorForOverview.pipelineStage as string;
          console.log(`[Timers] ⏰ 8m OVERVIEW PENDENTE detectado para visitante ${visitorId} (estágio: ${stage}) — criando card automaticamente`);

          const sendFinalMsgs = async () => {
            const msgs = [
              "Vou entender isso como um sim! 😊",
              "Muito obrigado pelas informações.",
              "A nossa equipe já recebeu os seus dados e o responsável entrará em contato em breve.",
            ];
            for (const text of msgs) {
              await lcStorage.createMessage({ chatId, sender: 'ai', content: text });
              sendToVisitor(visitorId, { type: 'CHAT_REPLY', chatId, sender: 'ai', content: text, timestamp: new Date().toISOString() });
              broadcastToAgents({ type: 'CHAT_MESSAGE', chatId, visitorId, sender: 'ai', content: text, timestamp: new Date().toISOString() });
              await new Promise(r => setTimeout(r, 800)); // typing delay visualzinho
            }
          };

          const parseOvField = (...labels: string[]): string | null => {
            for (const label of labels) {
              const re = new RegExp(`^\\s*[•\\-]\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'i');
              const msg = [...recentMsgs].reverse().find((m: any) => m.sender === 'ai' && re.test(m.content.trim()));
              if (msg) { const cap = msg.content.trim().match(re); if (cap?.[1]) return cap[1].trim(); }
            }
            return null;
          };

          const snippetOv = recentMsgs.slice(-20)
            .filter((m: any) => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
            .map((m: any) => `${m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]'} ${m.content.slice(0, 120)}`)
            .join('\n');

          if (stage === 'maquinas' && visitorForOverview.maquinaDesejada) {
            // ── FALLBACK MÁQUINAS ──────────────────────────────────────────────
            (async () => {
              try {
                const maqDataOv = {
                  nome:             (visitorForOverview as any).maquinaClienteNome     ?? visitorForOverview.name ?? 'Não informado',
                  telefone:         ((visitorForOverview as any).maquinaTelefone        ?? parseOvField('Telefone', 'Tel') ?? '') as string,
                  email:            (visitorForOverview as any).maquinaEmail           ?? parseOvField('E-mail', 'Email') ?? null,
                  cnpjCpf:          (visitorForOverview as any).maquinaCnpjCpf         ?? parseOvField('CPF/CNPJ', 'CNPJ', 'CPF') ?? null,
                  maquinaDesejada:  visitorForOverview.maquinaDesejada                 ?? 'Não informado',
                  detalhes:         parseOvField('Detalhes', 'Observação')             ?? null,
                  produtoFabricado: visitorForOverview.maquinaProdutoFabricado         ?? parseOvField('Produto Fabricado', 'Produto') ?? 'Não definido',
                  volumeProducao:   visitorForOverview.maquinaVolumeProducao           ?? parseOvField('Volume de Produção', 'Volume') ?? 'Médio volume',
                  clienteNovo:      'SIM',
                  qualificacaoSDR:  visitorForOverview.maquinaQualificacaoSDR         ?? '2',
                  cnpjData:         visitorForOverview.posVendaCnpjData
                    ? (typeof visitorForOverview.posVendaCnpjData === 'string' ? JSON.parse(visitorForOverview.posVendaCnpjData) : visitorForOverview.posVendaCnpjData)
                    : undefined,
                };
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', '⏳ [OVERVIEW SEM RESPOSTA] Criando card MÁQUINAS após 8min de inatividade...').catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });

                const relatorioOv = await generateMaquinasReport({
                  nome: maqDataOv.nome, telefone: maqDataOv.telefone,
                  email: maqDataOv.email ?? null, cnpjCpf: maqDataOv.cnpjCpf ?? null,
                  maquinaDesejada: maqDataOv.maquinaDesejada,
                  detalhes: maqDataOv.detalhes ?? null,
                  produtoFabricado: maqDataOv.produtoFabricado,
                  volumeProducao: maqDataOv.volumeProducao,
                  clienteNovo: maqDataOv.clienteNovo,
                  qualificacaoSDR: maqDataOv.qualificacaoSDR,
                  cnpjData: maqDataOv.cnpjData,
                  conversationSnippet: snippetOv,
                  transcricaoCompleta: snippetOv,
                });
                let ownerOv: string | undefined;
                try { ownerOv = await lcStorage.getNextOwnerForFunnel('maquinas') ?? undefined; } catch {}
                const dealOv = await createMaquinasOS(visitorId, { ...maqDataOv, ownerId: ownerOv }, relatorioOv);
                const dealUrlOv = `https://crm.rdstation.com/app/deals/${dealOv}`;
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `✅ [OVERVIEW SEM RESPOSTA] Card MÁQUINAS criado após inatividade!\nID: ${dealOv}\n${dealUrlOv}`).catch(() => {});
                await lcStorage.setRdCrmDealId(visitorId, dealOv).catch(() => {});
                await lcStorage.setChatCloseReason(chatId, 'atendimento_concluido').catch(() => {});
                await sendFinalMsgs();
                clearFollowUpTimers(visitorId);
                await lcStorage.closeChat(chatId).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
                broadcastToAgents({ type: 'RD_CRM_OS_CREATED', visitorId, dealId: dealOv, dealUrl: dealUrlOv });
                broadcastToAgents({ type: 'CHAT_CLOSED', chatId, visitorId });
                console.log(`[Timers] ✅ [OVERVIEW SEM RESPOSTA] Deal MÁQUINAS criado (${dealOv}) após 8min — chat ${chatId} encerrado.`);
              } catch (ovErr: any) {
                console.error(`[Timers] ❌ Fallback OVERVIEW SEM RESPOSTA (maquinas) falhou:`, ovErr.message);
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `❌ Falha ao criar card por inatividade no OVERVIEW\n${ovErr.message}`).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
              }
            })();
            return; // não envia a mensagem de follow-up, pois vai criar o card

          } else if (stage === 'pecas' && visitorForOverview.pecaDesejada) {
            // ── FALLBACK PEÇAS ─────────────────────────────────────────────────
            (async () => {
              try {
                const pecasDataOv = {
                  nome:             (visitorForOverview as any).pecasNome     ?? visitorForOverview.name ?? 'Não informado',
                  telefone:         ((visitorForOverview as any).pecasTelefone ?? parseOvField('Telefone', 'Tel') ?? '') as string,
                  email:             parseOvField('E-mail', 'Email') ?? null,
                  cnpjCpf:           parseOvField('CPF/CNPJ', 'CNPJ', 'CPF') ?? null,
                  pecaDesejada:      visitorForOverview.pecaDesejada,
                  eCliente:          'NÃO INFORMADO',
                  cnpjData:          undefined,
                };
                
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', '⏳ [OVERVIEW SEM RESPOSTA] Criando card PEÇAS após 8min de inatividade...').catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
                
                const relatorioOv = await generatePecasReport({
                  ...pecasDataOv,
                  conversationSnippet: snippetOv,
                  transcricaoCompleta: snippetOv,
                });
                
                let ownerOv: string | undefined;
                try { ownerOv = await lcStorage.getNextOwnerForFunnel('pecas') ?? undefined; } catch {}
                
                const dealOv = await createPecasOS(visitorId, { ...pecasDataOv, ownerId: ownerOv }, relatorioOv);
                const dealUrlOv = `https://crm.rdstation.com/app/deals/${dealOv}`;
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `✅ [OVERVIEW SEM RESPOSTA] Card PEÇAS criado após inatividade!\nID: ${dealOv}\n${dealUrlOv}`).catch(() => {});
                await lcStorage.setRdCrmDealId(visitorId, dealOv).catch(() => {});
                await lcStorage.setChatCloseReason(chatId, 'atendimento_concluido').catch(() => {});
                await sendFinalMsgs();
                clearFollowUpTimers(visitorId);
                await lcStorage.closeChat(chatId).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
                broadcastToAgents({ type: 'RD_CRM_OS_CREATED', visitorId, dealId: dealOv, dealUrl: dealUrlOv });
                broadcastToAgents({ type: 'CHAT_CLOSED', chatId, visitorId });
                console.log(`[Timers] ✅ [OVERVIEW SEM RESPOSTA] Deal PEÇAS criado (${dealOv}) após 8min.`);
              } catch (ovErr: any) {
                console.error(`[Timers] ❌ Fallback OVERVIEW SEM RESPOSTA (pecas) falhou:`, ovErr.message);
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `❌ Falha ao criar card de peças por inatividade\n${ovErr.message}`).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
              }
            })();
            return;

          } else if (stage === 'pos_venda' && visitorForOverview.posVendaProblema) {
            // ── FALLBACK PÓS-VENDA ─────────────────────────────────────────────
            (async () => {
              try {
                const pvDataOv = {
                  nome:             (visitorForOverview as any).posVendaNome       ?? visitorForOverview.name ?? 'Não informado',
                  telefone:         ((visitorForOverview as any).posVendaTelefone   ?? parseOvField('Telefone', 'Tel') ?? '') as string,
                  email:             parseOvField('E-mail', 'Email') ?? null,
                  cnpjCpf:           parseOvField('CPF/CNPJ', 'CNPJ', 'CPF', 'CNPJ/CPF') ?? null,
                  notaPedido:        parseOvField('Nota Fiscal', 'Nº da Nota', 'Pedido', 'Nota') ?? null,
                  problema:          visitorForOverview.posVendaProblema ?? 'Não informado',
                  urgencia:          'NORMAL', // default fallback
                };
                
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', '⏳ [OVERVIEW SEM RESPOSTA] Criando OS PÓS VENDA após 8min de inatividade...').catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
                
                const relatorioOv = await generatePosVendaReport({
                  ...pvDataOv,
                  conversationSnippet: snippetOv,
                  transcricaoCompleta: snippetOv,
                });
                
                let ownerOv: string | undefined;
                try { ownerOv = await lcStorage.getNextOwnerForFunnel('pos_venda') ?? undefined; } catch {}
                
                const dealOv = await createPosVendaOS(visitorId, { ...pvDataOv, ownerId: ownerOv }, relatorioOv);
                const dealUrlOv = `https://crm.rdstation.com/app/deals/${dealOv}`;
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `✅ [OVERVIEW SEM RESPOSTA] OS PÓS VENDA criada após inatividade!\nID: ${dealOv}\n${dealUrlOv}`).catch(() => {});
                await lcStorage.setRdCrmDealId(visitorId, dealOv).catch(() => {});
                await lcStorage.setChatCloseReason(chatId, 'atendimento_concluido').catch(() => {});
                await sendFinalMsgs();
                clearFollowUpTimers(visitorId);
                await lcStorage.closeChat(chatId).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
                broadcastToAgents({ type: 'RD_CRM_OS_CREATED', visitorId, dealId: dealOv, dealUrl: dealUrlOv });
                broadcastToAgents({ type: 'CHAT_CLOSED', chatId, visitorId });
                console.log(`[Timers] ✅ [OVERVIEW SEM RESPOSTA] Deal PÓS VENDA criado (${dealOv}) após 8min.`);
              } catch (ovErr: any) {
                console.error(`[Timers] ❌ Fallback OVERVIEW SEM RESPOSTA (pos_venda) falhou:`, ovErr.message);
                await lcStorage.addVisitorNote(visitorId, 'RD CRM', `❌ Falha ao criar OS Pós Venda por inatividade\n${ovErr.message}`).catch(() => {});
                broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId });
              }
            })();
            return;
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const msg = "Ainda posso ajudar com algo? Qualquer dúvida é só falar! 😊";
      await lcStorage.createMessage({ chatId, sender: "ai", content: msg });
      sendToVisitor(visitorId, { type: "CHAT_REPLY", chatId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
      broadcastToAgents({ type: "CHAT_MESSAGE", chatId, visitorId, sender: "ai", content: msg, timestamp: new Date().toISOString() });
    } catch (err: any) { console.error("[Timers] 8m err:", err.message); }
  }, 8 * 60 * 1000);

  // 10 minutes closure - REMOVIDO para impedir a fragmentação dos chats.
  // O chat permanecerá aberto até que o cliente saia do site (o fallback sweepOrphanedChats fechará após 90min).
  // timers.t10m = setTimeout(...) removido.
  
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

// ─── Detect device type ───────────────────────────────────────────────────────

function detectDevice(ua?: string): string {
  if (!ua) return "desktop";
  const u = ua.toLowerCase();
  // Tablets primeiro (iPad, Android tablet, etc.)
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(u)) return "tablet";
  // Mobile
  if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini|opera mobi|windows phone/i.test(u)) return "mobile";
  return "desktop";
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
// IMPORTANTE: O timer proativo APENAS envia uma notificacao visual ao widget.
// NAO cria chat, NAO chama o Gemini, NAO envia mensagem.
// Motivo: o visitante sempre precisa inserir o nome antes de qualquer fluxo,
// e o Fagner ja faz abordagem ativa com 3 mensagens iniciais de boas-vindas.
// Enviar mensagem proativa antes disso causava fragmentacao e vazamento de instrucoes.

async function startProactiveTimer(visitorId: string): Promise<void> {
  if (proactiveTimers.has(visitorId)) return;
  if (!visitorConnections.has(visitorId)) return;

  const delaySetting = await lcStorage.getSettingParsed<number>("proactive_delay_ms");
  const delay = delaySetting ?? 60_000;

  const enabled = await lcStorage.getSettingParsed<boolean>("proactive_enabled");
  if (enabled === false) return;

  const timer = setTimeout(async () => {
    proactiveTimers.delete(visitorId);
    try {
      const existingChat = await lcStorage.getActiveChatByVisitor(visitorId);
      if (existingChat) return;

      const lastChat = await lcStorage.getLastChatByVisitor(visitorId);
      if (lastChat) {
        const hoursAgo24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (new Date(lastChat.startedAt) > hoursAgo24) return;
      }

      const visitor = await lcStorage.getVisitorById(visitorId);
      if (!visitor || visitor.isOnline !== "true") return;

      // Apenas notificacao visual: badge/pulse no widget, sem criar chat nem chamar Gemini
      sendToVisitor(visitorId, {
        type: "PROACTIVE_PULSE",
        timestamp: new Date().toISOString(),
      });

      broadcastToAgents({
        type: "VISITOR_ACTIVE_NO_CHAT",
        visitorId,
        page: visitor.currentPage,
        pageTitle: visitor.currentPageTitle,
      });

      console.log(`[LiveChat] Pulse proativo (visual) para visitante ${visitorId}`);
    } catch (err: any) {
      console.error("[LiveChat] Erro no pulse proativo:", err.message);
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
            const deviceType = detectDevice(ua);
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
              // Atualiza deviceType separadamente (campo não está no updateVisitor padrão)
              if (visitor?.id) {
                await db.execute(sql`UPDATE lc_visitors SET "deviceType" = ${deviceType} WHERE "id" = ${visitor.id}`);
              }
              visitorId = visitor!.id;
              await recalculateVisitorCategory(visitorId);

              // ── Alerta de Lead Quente Voltando (#6) ────────────────────────
              // Só alerta se: tem nome + múltiplas visitas + é lead_hot
              const updatedV = await lcStorage.getVisitorById(visitorId);
              if (
                updatedV?.name &&
                (updatedV.totalVisits ?? 0) >= 2 &&
                updatedV.category === 'lead_hot'
              ) {
                broadcastToAgents({
                  type: "RETURNING_HOT_LEAD",
                  visitorId,
                  visitorName: updatedV.name,
                  city: updatedV.city,
                  country: updatedV.country,
                  currentPage: data.currentPage,
                  currentPageTitle: data.pageTitle,
                  totalVisits: updatedV.totalVisits,
                  engagementScore: updatedV.engagementScore,
                  purchaseIntentScore: (updatedV as any).purchaseIntentScore ?? 0,
                  source: updatedV.source,
                  timestamp: new Date().toISOString(),
                });
                console.log(`[LiveChat] 🔥 RETURNING_HOT_LEAD: ${updatedV.name} voltou ao site (${updatedV.totalVisits} visitas)`);
              }
              // O visitante pode estar navegando entre páginas no site VTEX (MPA).
              // O sweepOrphanedChats cuida de fechar chats realmente abandonados (>90min).
              // Essa lógica foi REMOVIDA pois causava fragmentação de chats.
              // A sessão AI será reconstruída do banco quando necessário.
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
              // Salva deviceType para novos visitantes
              await db.execute(sql`UPDATE lc_visitors SET "deviceType" = ${deviceType} WHERE "id" = ${visitorId}`);
            }

            // Set pipeline stage — NUNCA rebaixa estágios de atendimento ativo ou concluído
            // Só define 'novo_atendimento' se o visitante não tem estágio OU estava exatamente em 'novo_atendimento'
            const ACTIVE_STAGES = [
              'em_atendimento',
              'pos_venda',
              'outros',
              'maquinas',           // FIX: nunca rebaixar visitante que já foi qualificado em maquinas
              'pecas',              // FIX: idem para peças
              'finalizado_com_venda',
              'finalizado_sem_venda',
              'vendido',
              'sem_resposta',       // FIX: não resetar quem está classified como sem_resposta
            ];
            if (visitor && !visitor.pipelineStage) {
              await lcStorage.updateVisitorPipeline(visitorId, "novo_atendimento");
            } else if (visitor && visitor.pipelineStage === 'novo_atendimento') {
              // Só reseta se JÁ estava em novo_atendimento — nunca rebaixa quem avançou
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

            // ── RECUPERAÇÃO PÓS-RECONEXÃO (MPA/F5) ───────────────────
            // A VTEX é MPA: cada navegação desmonta o widget e fecha o WS.
            // Qualquer mensagem enviada durante esse gap (incluindo AGENT_JOINED)
            // seria perdida silenciosamente. Ao reconectar, reenviamos:
            //   1. AGENT_JOINED — se o chat estiver em human_active
            //   2. Últimas mensagens do banco — para sincronizar o histórico
            // Delay de 800ms para garantir que o WS do cliente está pronto.
            setTimeout(async () => {
              try {
                const activeChat = await lcStorage.getActiveChatByVisitor(visitorId);
                if (!activeChat) return;

                // 1. Reenviar notificação de agente humano se chat estiver assumido
                if (activeChat.status === 'human_active') {
                  // Resolve nome real do operador (agentId é UUID, não nome)
                  let agentLabel = 'Atendente';
                  if (activeChat.agentId) {
                    try {
                      const { storage: appStorage } = await import('../storage.js');
                      const agentUser = await appStorage.getUserSafeById(activeChat.agentId);
                      agentLabel = agentUser?.name || agentUser?.username || activeChat.agentId;
                    } catch {
                      agentLabel = activeChat.agentId;
                    }
                  }
                  console.log(`[LiveChat] RECONNECT — visitante ${visitorId} reconectou com chat human_active. Operador: "${agentLabel}".`);
                  // Não enviamos um AGENT_JOINED extra aqui: o loop abaixo já reenvia
                  // a system message salva no histórico (que contém o nome correto do operador).
                }

                // 2. Reenviar mensagens recentes para sincronizar histórico
                // Envia apenas as últimas 10 mensagens do AI/agente não vistas
                const recentMsgs = await lcStorage.listMessagesByChat(activeChat.id);
                const lastMsgs = recentMsgs
                  .filter((m: any) => m.sender === 'ai' || m.sender === 'agent' || m.sender === 'system')
                  .slice(-10);
                // Regex para detectar mensagens internas (logs, erros, audio) que NÃO devem ir ao visitante
                const INTERNAL_MSG_REGEX = /^\[[A-Z0-9_]+[:\]]/;
                for (const msg of lastMsgs) {
                  if (msg.sender === 'system') {
                    ws.send(JSON.stringify({
                      type: 'AGENT_JOINED',
                      message: msg.content,
                      chatId: activeChat.id,
                    }));
                  } else {
                    const content: string = msg.content || '';
                    // Filtra mensagens internas: [SYSTEM_ERROR:...], [AUDIO:...], [CNPJ_RESULT:...] etc.
                    // Logs e áudios serão re-enviados ao admin via broadcastToAgents, não ao visitante
                    if (INTERNAL_MSG_REGEX.test(content.trim())) continue;
                    ws.send(JSON.stringify({
                      type: 'CHAT_REPLY',
                      chatId: activeChat.id,
                      sender: msg.sender,
                      content,
                      timestamp: msg.sentAt ?? new Date().toISOString(),
                      fromHistory: true,
                    }));
                  }
                }
              } catch (rErr: any) {
                console.warn('[LiveChat] RECONNECT healing error:', rErr.message);
              }
            }, 800);

            break;
          }

          // ── VISITOR: Page navigation ──────────────────────────────
          case "PAGE_UPDATE": {
            if (!visitorId) break;
            await lcStorage.updateVisitor(visitorId, {
              currentPage: data.url,
              currentPageTitle: data.pageTitle,
            });

            // Resolve intenção da página (#2)
            const intentData = resolvePageIntent(data.url);

            const pvRecord = await lcStorage.createPageview({
              visitorId,
              url: data.url,
              pageTitle: data.pageTitle,
              intentTag: intentData.tag,
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

              // Incrementa Purchase Intent Score (#4) com base na intenção da página
              if (intentData.scoreBoost > 0) {
                await lcStorage.incrementPurchaseIntentScore(visitorId, intentData.scoreBoost);
              }
            }

            broadcastToAgents({
              type: "VISITOR_PAGE_UPDATE",
              visitorId,
              url: data.url,
              pageTitle: data.pageTitle,
              intentTag: intentData.tag,
              intentLabel: intentData.label,
              intentIcon: intentData.icon,
              pageviewId: pvRecord.id,
            });

            // Reset proactive timer
            startProactiveTimer(visitorId);
            break;
          }

          // ── VISITOR: Pageview time/scroll update (#1) ─────────────
          case "PAGEVIEW_UPDATE": {
            if (!visitorId || !data.pageviewId) break;
            await lcStorage.updatePageview(data.pageviewId, {
              timeSpent: typeof data.timeSpent === 'number' ? Math.round(data.timeSpent) : undefined,
              scrollDepth: typeof data.scrollDepth === 'number' ? Math.min(100, Math.round(data.scrollDepth)) : undefined,
            });
            // Purchase intent: se ficou mais de 2 min em página de produto (+5)
            if (data.timeSpent >= 120 && data.intentTag && data.intentTag !== 'navegacao_geral') {
              await lcStorage.incrementPurchaseIntentScore(visitorId, 5);
            }
            break;
          }

          // ── VISITOR: Clique em CTA (WhatsApp, Fagner, Telefone, etc.) ─────
          case "CLICK_EVENT": {
            if (!visitorId) break;
            await lcStorage.recordClickEvent({
              visitorId,
              url: data.url ?? '',
              elementId: data.elementId,
              elementText: data.elementText,
              clickType: data.clickType ?? 'custom',
            });
            // CTA de WhatsApp / Chat: aumenta purchase intent
            if (data.clickType === 'whatsapp' || data.clickType === 'chat_open') {
              await lcStorage.incrementPurchaseIntentScore(visitorId, 10);
            } else if (data.clickType === 'phone' || data.clickType === 'cta_button') {
              await lcStorage.incrementPurchaseIntentScore(visitorId, 5);
            }
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

            // Persistir nome no registro do visitante (sempre atualiza — nunca cria novo)
            try { await lcStorage.setVisitorName(visitorId, data.name); } catch {}

            // ⚡ Visitante voltou: cancela os timers de follow-up/encerramento que estavam
            // rodando desde que desconectou. Isso evita que o chat seja fechado automaticamente
            // enquanto o visitante estava só navegando em outra aba.
            clearFollowUpTimers(visitorId);

            const chat = await lcStorage.getActiveChatByVisitor(visitorId);
            if (chat) {
              // Chat ativo existe: apenas atualiza o nome e notifica painel
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
            // Se não há chat ativo: não faz nada especial — o chat será criado
            // normalmente quando o visitante enviar a primeira mensagem (CHAT_MESSAGE).
            // O Fagner saberá o nome via visitor.name injetado no contexto.

            // Mover pipeline para Em Atendimento (só se não estiver em estágio final)
            try {
              const FINAL_STAGES = ['finalizado_com_venda', 'finalizado_sem_venda', 'pos_venda'];
              const currentVisitor = await lcStorage.getVisitorById(visitorId);
              if (!FINAL_STAGES.includes(currentVisitor?.pipelineStage ?? '')) {
                await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
                broadcastPipelineUpdate(visitorId, "em_atendimento");
              }
            } catch {}
            break;
          }

          // ── VISITOR: Restart chat ─────────────────────────────────
          case "RESTART_CHAT": {
            if (!visitorId) break;
            const chatToClose = await lcStorage.getActiveChatByVisitor(visitorId);
            if (chatToClose) {
              await lcStorage.closeChat(chatToClose.id);
              // Marca como 'restarted' para impedir que o safety net reabra este chat
              await lcStorage.setChatCloseReason(chatToClose.id, "restarted");
              clearAISession(chatToClose.id);
              broadcastToAgents({
                type: "CHAT_STATUS",
                chatId: chatToClose.id,
                status: "closed",
                closeReason: "restarted",
              });
              console.log(`[LiveChat] Chat ${chatToClose.id} encerrado e marcado como 'restarted' pelo visitante.`);
            }
            break;
          }

          // ── VISITOR: Product inquiry (botão contextual de produto) ──
          case "PRODUCT_INQUIRY": {
            if (!visitorId) break;
            const { productSlug, productUrl, visitorMessage } = data;
            if (!productSlug || !visitorMessage) break;

            console.log(`[ProductInquiry] Visitante ${visitorId} perguntou sobre produto: "${productSlug}"`);

            // 1. Garante/cria o chat (mesma lógica de CHAT_MESSAGE)
            let piqChat: any = await lcStorage.getActiveChatByVisitor(visitorId);
            if (!piqChat) {
              const lastChat = await lcStorage.getLastChatByVisitor(visitorId);
              if (lastChat && lastChat.status === 'closed') {
                const closedTs = lastChat.endedAt ?? lastChat.startedAt;
                const closedAgo = Date.now() - new Date(closedTs).getTime();
                if (closedAgo < 30 * 60 * 1000 && (lastChat as any).closeReason !== 'restarted') {
                  await lcStorage.updateChat(lastChat.id, { status: 'ai_active' });
                  piqChat = await lcStorage.getChatById(lastChat.id);
                }
              }
            }
            if (!piqChat) {
              piqChat = await lcStorage.createChat({ visitorId, source: "widget" });
            }

            // 2. Salva mensagem do visitante no banco
            await lcStorage.createMessage({ chatId: piqChat.id, sender: "visitor", content: visitorMessage });
            clearFollowUpTimers(visitorId);

            // Notifica agentes
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: piqChat.id,
              visitorId,
              sender: "visitor",
              visitorName: piqChat.visitorName ?? null,
              content: visitorMessage,
              timestamp: new Date().toISOString(),
            });

            // Move pipeline para em_atendimento
            try {
              await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
              broadcastPipelineUpdate(visitorId, "em_atendimento");
            } catch {}

            // 3. Mostra typing enquanto busca produto
            sendToVisitor(visitorId, { type: "TYPING_START" });

            // 4. Consulta VTEX — em background, não bloqueia o WS
            const piqVisitorId = visitorId as string;
            const piqChatId    = piqChat.id;
            (async () => {
              try {
                const productInfo = await getProductBySlug(productSlug);

                // Monta contexto enriquecido para o Gemini
                let productContext: string;
                if (productInfo) {
                  productContext = formatProductContextForAI(productInfo);
                  // Salva na sessão do Gemini para uso em toda a conversa
                  setProductContext(piqChatId, productContext);
                  console.log(`[ProductInquiry] ✅ Dados VTEX encontrados para "${productInfo.productName}"`);
                } else {
                  // Fallback: sem dados da VTEX, usa só o slug formatado
                  const readableName = productSlug
                    .replace(/---[^-]+$/, "")
                    .replace(/-/g, " ")
                    .replace(/\b\w/g, (c: string) => c.toUpperCase());
                  productContext = `Nome do Produto (estimado pelo slug): ${readableName}\nURL: ${productUrl}\nObs: dados técnicos detalhados não disponíveis no momento.`;
                  console.warn(`[ProductInquiry] ⚠️ Produto não encontrado na VTEX para slug "${productSlug}" — usando fallback.`);
                }

                // 5. Chama o Fagner com contexto injetado
                const piqVisitor = await lcStorage.getVisitorById(piqVisitorId);
                const contextualMessage = `[CONTEXTO_PRODUTO_VTEX]\n${productContext}\n[/CONTEXTO_PRODUTO_VTEX]\n\n${visitorMessage}`;

                const aiResponse: any = await processVisitorMessage(
                  piqChatId,
                  contextualMessage,
                  piqVisitor?.currentPage ?? undefined,
                  piqVisitor?.name ?? undefined,
                );

                sendToVisitor(piqVisitorId, { type: "TYPING_STOP" });

                const aiReply: string = aiResponse?.reply ?? "Vou buscar as informações sobre esse produto para você!";

                // ── Limpeza de tags invisíveis (igual ao pipeline de CHAT_MESSAGE) ──
                const piqCleanReply = aiReply
                  .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, "")
                  .replace(/\[SCORE:\d+\]/gi, "")
                  .replace(/\[PRODUTO_IDENTIFICADO:[^\]]+\]/gi, "")
                  .replace(/\[STAGE:[^\]]+\]/gi, "")
                  .replace(/\[POS_VENDA_DADOS:[\s\S]*?\]/gi, "")
                  .replace(/\[MAQUINAS_DADOS:[\s\S]*?\]/gi, "")
                  .replace(/\[PECAS_DADOS:[\s\S]*?\]/gi, "")
                  .replace(/\[CNPJ_CHECK:[^\]]+\]/gi, "")
                  .replace(/\[CNPJ_RESULT:[\s\S]*?\]/gi, "")
                  .replace(/\[CRASH:[^\]]*\]/gi, "")
                  .trim();

                // Fragmenta a resposta limpa por parágrafos
                const fragments = piqCleanReply
                  .split(/\n\n+/)
                  .map((f) => f.trim())
                  .filter((f) => f.length > 0);

                // Salva CADA chunk individualmente no banco (não o bloco bruto com tags)
                // Isso garante que o fromHistory (reconexão) reenvie mensagens limpas e separadas
                for (const chunk of fragments) {
                  await lcStorage.createMessage({ chatId: piqChatId, sender: "ai", content: chunk });
                }

                // Envia cada fragmento para o visitante com delay progressivo (400ms entre eles)
                for (let i = 0; i < fragments.length; i++) {
                  const frag = fragments[i];
                  const delay = i * 420;
                  setTimeout(() => {
                    sendToVisitor(piqVisitorId, {
                      type: "CHAT_REPLY",
                      chatId: piqChatId,
                      sender: "ai",
                      content: frag,
                      timestamp: new Date().toISOString(),
                    });
                  }, delay);
                }

                // Notifica o painel dos agentes com a mensagem completa
                broadcastToAgents({
                  type: "CHAT_MESSAGE",
                  chatId: piqChatId,
                  visitorId: piqVisitorId,
                  sender: "ai",
                  content: aiReply,
                  timestamp: new Date().toISOString(),
                });

                // Inicia follow-up após todos os fragments terem sido enviados
                setTimeout(() => {
                  startFollowUpTimers(piqVisitorId, piqChatId);
                }, fragments.length * 420 + 200);

              } catch (err: any) {
                console.error(`[ProductInquiry] ❌ Erro ao processar produto:`, err.message);
                sendToVisitor(piqVisitorId, { type: "TYPING_STOP" });
                const fallbackMsg = "Vou verificar as informações sobre esse produto! Um momento. 😊";
                await lcStorage.createMessage({ chatId: piqChatId, sender: "ai", content: fallbackMsg });
                sendToVisitor(piqVisitorId, { type: "CHAT_REPLY", chatId: piqChatId, sender: "ai", content: fallbackMsg, timestamp: new Date().toISOString() });
              }
            })();

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
                // ── SAFETY NET: Reabrir chat recém-fechado ao invés de criar novo ──
                // Se o visitante tinha um chat que foi fechado nos últimos 30 min,
                // reabrir ao invés de fragmentar a conversa.
                const lastChat = await lcStorage.getLastChatByVisitor(visitorId);
                if (lastChat && lastChat.status === 'closed') {
                  const closedTs = lastChat.endedAt ?? lastChat.startedAt;
                  const closedAgo = Date.now() - new Date(closedTs).getTime();
                  const REOPEN_WINDOW_MS = 30 * 60 * 1000; // 30 minutos
                  // NÃO reabrir se o chat foi encerrado intencionalmente pelo visitante (RESTART_CHAT)
                  const wasRestarted = (lastChat as any).closeReason === 'restarted';
                  if (closedAgo < REOPEN_WINDOW_MS && !wasRestarted) {
                    await lcStorage.updateChat(lastChat.id, { status: 'ai_active' });
                    chat = await lcStorage.getChatById(lastChat.id);
                    console.log(`[LiveChat] Chat ${lastChat.id} REABERTO (fechado há ${Math.round(closedAgo/60000)}min) ao invés de criar novo.`);
                  }
                }
              }
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

            // Mover para em_atendimento APENAS se o visitante não está já em um stage
            // final/protegido. Isso evita que mensagens pós-conclusão (ex: "obrigado", "👍")
            // destruam o card já finalizado ao resetar o stage.
            // Exemplo: João confirmou os dados (→ maquinas) e depois mandou "Eu que agradeço"
            // → sem esta proteção, ele voltaria para em_atendimento → sem_resposta.
            try {
              const FINAL_STAGES = [
                'maquinas', 'pecas', 'pos_venda',
                'finalizado_com_venda', 'finalizado_sem_venda',
                'sem_resposta', 'outros', 'vendido',
              ];
              const currentVisitorStage = (await lcStorage.getVisitorById(visitorId))?.pipelineStage ?? '';
              if (!FINAL_STAGES.includes(currentVisitorStage)) {
                await lcStorage.updateVisitorPipeline(visitorId, "em_atendimento");
                broadcastPipelineUpdate(visitorId, "em_atendimento");
              }
              // Se já está em stage final, mantém onde está — nova mensagem não reseta o card
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
              visitorName: chat.visitorName ?? data.visitorName ?? null,
              content: data.content,
              timestamp: new Date().toISOString(),
            });

            // ── Notas Progressivas: a cada 5 mensagens do visitante, gera nota automática ──
            // Roda em background (não bloqueia o pipeline de resposta da IA)
            {
              const currentCount = (visitorMsgCounters.get(chat.id) ?? 0) + 1;
              visitorMsgCounters.set(chat.id, currentCount);
              if (currentCount % 5 === 0) {
                const noteVisitorId = visitorId as string;
                const noteChatId = chat.id;
                (async () => {
                  try {
                    const progressiveNote = await generateProgressiveNote(noteChatId);
                    if (progressiveNote) {
                      await lcStorage.addVisitorNote(noteVisitorId, "Atendimento", progressiveNote);
                      broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: noteVisitorId });
                      console.log(`[LiveChat Notes] 📝 Nota progressiva salva para visitante ${noteVisitorId} (msg #${currentCount})`);
                    }
                  } catch (noteErr: any) {
                    console.warn(`[LiveChat Notes] Falha na nota progressiva:`, noteErr.message);
                  }
                })();
              }
            }

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

              // NÃO mostrar typing ainda — só após os 15s de silêncio do cliente
              const currentVisitorId = visitorId as string;

              // Timer de 15s: só processa quando o cliente pára de digitar por 15 segundos
              buffer.timer = setTimeout(async () => {
                const bufferedContents = chatMessageBuffers.get(chat.id)?.content ?? [data.content];

                // ── GUARD: chatsBeingProcessed — evita race condition de múltiplos timers ──
                // Cenário: Gemini lento (90s timeout) → múltiplos timers criados em paralelo
                // → todos disparam quando Claude assume → "Fagner conversando sozinho".
                // Solução: apenas o PRIMEIRO timer a disparar processa; os demais são descartados.
                if (chatsBeingProcessed.has(chat.id)) {
                  console.log(`[LiveChat Buffer] Chat ${chat.id}: duplo timer ignorado (já processando).`);
                  return;
                }
                chatsBeingProcessed.add(chat.id);
                chatMessageBuffers.delete(chat.id);

                // ── GUARD 2.0: Verifica se operador assumiu durante o buffer de 15s ──
                // cancelGeneration() só cancela o fetch Gemini se ele JÁ iniciou.
                // Se o TAKE_OVER chegou DENTRO dos 15s, o Gemini ainda não foi chamado.
                // Esta verificação garante que não iremos chamar a IA nesse caso.
                {
                  const chatSnapshot = await lcStorage.getChatById(chat.id);
                  if (!chatSnapshot || chatSnapshot.status === "human_active" || chatSnapshot.status === "closed") {
                    console.log(`[LiveChat AI] ⚡ Buffer de 15s abortado — chat ${chat.id} status="${chatSnapshot?.status}" (operador assumiu durante o debounce)`);
                    sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                    return;
                  }
                }

                // Smart deduplication: se a última mensagem do buffer contém um dado estruturado
                // (CNPJ, CPF, CEP, email), usa APENAS ela — evita confundir o Gemini
                // com repetições do mesmo dado + perguntas avulsas concatenadas.
                const lastMsg = bufferedContents[bufferedContents.length - 1] ?? data.content;
                const isStructuredData = /\d{2}\.\d{3}\.\d{3}[\/\\]\d{4}-\d{2}/.test(lastMsg)  // CNPJ
                  || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(lastMsg)                                  // CPF
                  || /\d{5}-?\d{3}/.test(lastMsg)                                               // CEP
                  || /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(lastMsg);         // Email

                const combinedContent = isStructuredData
                  ? lastMsg  // Usa só o dado estruturado — descarta ruído anterior do buffer
                  : bufferedContents.join("\n\n");  // Concatena normalmente para mensagens comuns

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
                let rawReply: string = "";
                let aiTurnContent = combinedContent;
                let internalTurns = 0;

                // Verifica se o CNPJ já foi validado neste chat (existe [CNPJ_RESULT] no histórico).
                // Se sim, qualquer [CNPJ_CHECK] gerado pelo Gemini será ignorado — mesmo no turno 0.
                // Isso previne que o AI revalide o CNPJ ao escrever o OVERVIEW ou a farewell,
                // que são as duas situações que causavam o loop duplicado + perda da [MAQUINAS_DADOS].
                const recentMsgsPreLoop = await lcStorage.listMessagesByChat(chat.id);
                let cnpjAlreadyVerified = recentMsgsPreLoop.some(
                  m => m.sender === 'visitor' && m.content.startsWith('[CNPJ_RESULT:')
                );

                while (internalTurns < 3) {
                  try {

                    aiResponse = await processVisitorMessage(
                      chat.id,
                      aiTurnContent,
                      visitor?.currentPage ?? undefined,
                      visitor?.name ?? undefined,
                    ) as any;
                  } catch (err: any) {
                    console.error(`[LiveChat AI] ❌ ERRO CRÍTICO (Uncaught) no processVisitorMessage:`, err);
                    sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                    aiResponse = { reply: `Hm, acho que não entendi. O que você precisa exatamente? [CRASH: ${err.message}]`, isError: true };
                    break;
                  }

                  if (aiResponse.isError && !aiResponse.reply) {
                    aiResponse.reply = "Hm, parece que estou sem acesso ao meu cérebro agora. Alguém da equipe já vai te atender!";
                    break;
                  }

                  rawReply = aiResponse.reply;

                  // ── Erro de IA (Gemini timeout, rede, etc.) ─────────────────────────
                  // Separa o log técnico (para admin, "Log Oculto") da mensagem limpa (para o cliente)
                  if (aiResponse.isError) {
                    sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                    // Salva o log técnico [SYSTEM_ERROR: ...] no banco (admin vê como "Log Oculto")
                    await lcStorage.createMessage({ chatId: chat.id, sender: "ai", content: rawReply });
                    broadcastToAgents({ type: "CHAT_MESSAGE", chatId: chat.id, visitorId: currentVisitorId, sender: "ai", content: rawReply, timestamp: new Date().toISOString() });
                    // ⚠️ NÃO envia nenhuma mensagem ao visitante — silêncio total para o cliente.
                    // O admin vê o log técnico no painel como "Log Oculto (Sistema)".
                    // ⚠️ NÃO inicia timer de follow-up: o silêncio foi causado por falha do sistema,
                    // não por inatividade real do visitante. Disparar "Opa, você ainda está aí?"
                    // após um erro de API é incorreto e confunde o cliente.
                    break;
                  }

                  const cnpjCheckMatch = rawReply.match(/\[CNPJ_CHECK:([^\]]+)\]/);

                  // ⚠️ GUARD: bloqueia [CNPJ_CHECK] quando:
                  //   1) internalTurns > 0 (já injetou CNPJ_RESULT neste processamento), OU
                  //   2) cnpjAlreadyVerified = true (CNPJ foi validado em mensagem anterior deste chat)
                  // Isso impede que o Gemini re-valide o CNPJ ao escrever o OVERVIEW ou a farewell,
                  // prevenindo tanto a duplicação de mensagens quanto a perda de [MAQUINAS_DADOS].
                  if (cnpjCheckMatch && (internalTurns > 0 || cnpjAlreadyVerified)) {
                    console.log(`[LiveChat] ⚠️ CNPJ_CHECK ignorado (turno=${internalTurns}, jaVerificado=${cnpjAlreadyVerified}) — strip e break`);
                    rawReply = rawReply.replace(/\[CNPJ_CHECK:[^\]]+\]/g, '').trim();
                    break;
                  }

                  if (cnpjCheckMatch) {

                    const doc = cnpjCheckMatch[1];
                    // Remove CNPJ_CHECK tag e SCORE antes de enviar ao cliente
                    const cleanMsg = rawReply
                      .replace(/\[CNPJ_CHECK:[^\]]+\]/g, "")
                      .replace(/\[SCORE:\d+\]/gi, "")
                      .replace(/\[STAGE:[^\]]+\]/gi, "")
                      .trim();

                    if (cleanMsg) {
                      sendToVisitor(currentVisitorId, { type: "TYPING_STOP" });
                      await lcStorage.createMessage({ chatId: chat.id, sender: "ai", content: cleanMsg });
                      sendToVisitor(currentVisitorId, { type: "CHAT_REPLY", chatId: chat.id, sender: "ai", content: cleanMsg, timestamp: new Date().toISOString() });
                      broadcastToAgents({ type: "CHAT_MESSAGE", chatId: chat.id, visitorId: currentVisitorId, sender: "ai", content: cleanMsg, timestamp: new Date().toISOString() });
                      sendToVisitor(currentVisitorId, { type: "TYPING_START" });
                    }

                    // Utils inline validation
                    const d = doc.replace(/\D/g, "");
                    const isMathValid = (function(c) {
                      if(c.length === 11) {
                         if (/^(\d)\1+$/.test(c)) return false;
                         let sum=0, rem;
                         for(let i=1;i<=9;i++) sum += parseInt(c.substring(i-1,i))*(11-i);
                         rem = (sum*10)%11; if(rem===10||rem===11) rem=0; if(rem!==parseInt(c.substring(9,10))) return false;
                         sum=0; for(let i=1;i<=10;i++) sum += parseInt(c.substring(i-1,i))*(12-i);
                         rem = (sum*10)%11; if(rem===10||rem===11) rem=0; if(rem!==parseInt(c.substring(10,11))) return false;
                         return true;
                      } else if(c.length === 14) {
                         if (/^(\d)\1+$/.test(c)) return false;
                         let size=c.length-2, num=c.substring(0,size), dig=c.substring(size), sum=0, pos=size-7;
                         for(let i=size;i>=1;i--){sum+=parseInt(num.charAt(size-i))*pos--;if(pos<2)pos=9;}
                         let res=sum%11<2?0:11-sum%11; if(res!==parseInt(dig.charAt(0))) return false;
                         size=size+1; num=c.substring(0,size); sum=0; pos=size-7;
                         for(let i=size;i>=1;i--){sum+=parseInt(num.charAt(size-i))*pos--;if(pos<2)pos=9;}
                         res=sum%11<2?0:11-sum%11; if(res!==parseInt(dig.charAt(1))) return false;
                         return true;
                      }
                      return false;
                    })(d);

                    let result: any;
                    if (!isMathValid) {
                      result = { valid: false, motivo: "matematica" };
                    } else if (d.length === 14) {
                      try {
                        const r = await fetch(`https://publica.cnpj.ws/cnpj/${d}`);
                        if (!r.ok) throw new Error();
                        const rd = await r.json();
                        const cnpjData = {
                          cnpj: d,
                          nome: rd.razao_social,
                          fantasia: rd.estabelecimento?.nome_fantasia || null,
                          logradouro: rd.estabelecimento ? `${rd.estabelecimento.tipo_logradouro || ''} ${rd.estabelecimento.logradouro || ''}`.trim() : null,
                          numero: rd.estabelecimento?.numero || null,
                          bairro: rd.estabelecimento?.bairro || null,
                          cep: rd.estabelecimento?.cep || null,
                          municipio: rd.estabelecimento?.cidade?.nome || null,
                          uf: rd.estabelecimento?.estado?.sigla || null,
                          situacao: rd.estabelecimento?.situacao_cadastral || null,
                          // Campos adicionais
                          dataAbertura: rd.estabelecimento?.data_inicio_atividade || null,
                          capitalSocial: rd.capital_social || null,
                          porte: rd.porte?.descricao || null,
                          naturezaJuridica: rd.natureza_juridica?.descricao || null,
                          matrizFilial: rd.estabelecimento?.tipo === 'Matriz' ? 'Matriz' : 'Filial',
                          cnaePrincipal: rd.estabelecimento?.atividade_principal
                            ? `${rd.estabelecimento.atividade_principal.subclasse} - ${rd.estabelecimento.atividade_principal.descricao}`
                            : null,
                          cnaesSecundarios: rd.estabelecimento?.atividades_secundarias
                            ?.slice(0, 3)
                            .map((a: any) => `${a.subclasse} - ${a.descricao}`)
                            .join('; ') || null,
                          socios: rd.socios
                            ?.slice(0, 5)
                            .map((s: any) => s.nome)
                            .join(', ') || null,
                          telefone1: rd.estabelecimento?.telefone1 || null,
                          telefone2: rd.estabelecimento?.telefone2 || null,
                          email: rd.estabelecimento?.email || null,
                        };
                        result = { valid: true, nome: rd.razao_social, dados: cnpjData };
                        await lcStorage.updateVisitorPosVendaData(currentVisitorId, { cnpjData });
                      } catch {
                        result = { valid: false, motivo: "api_sem_retorno" };
                      }
                    } else {
                      result = { valid: true };
                    }

                    await lcStorage.createMessage({ chatId: chat.id, sender: "visitor", content: `[CNPJ_RESULT:${JSON.stringify(result)}]` });
                    aiTurnContent = `[CNPJ_RESULT:${JSON.stringify(result)}]`;
                    internalTurns++;
                  } else {
                    break;
                  }
                }

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
                  .replace(/\[STAGE:[^\]]+\]/gi, "")
                  .replace(/\[POS_VENDA_DADOS:[\s\S]*?\]/gi, "")
                  .replace(/\[MAQUINAS_DADOS:[\s\S]*?\]/gi, "")
                  .replace(/\[PECAS_DADOS:[\s\S]*?\]/gi, "")   // ← estava vazando para o cliente!
                  .replace(/\[CNPJ_CHECK:[^\]]+\]/gi, "")        // ← prevenção extra
                  .replace(/\[CNPJ_RESULT:[\s\S]*?\]/gi, "")     // ← prevenção extra
                  .replace(/\[CRASH:[^\]]*\]/gi, "")
                  .trim();

                // ─── Pré-processa: garante que URLs fiquem em parágrafos próprios ─────────
                // Também converte bullets (• linha) em parágrafos duplos para que cada
                // campo de confirmação de dados apareça em um balão separado
                const processedReply = cleanReply
                  .replace(/(https?:\/\/[^\s)]+)/gi, "\n\n$1\n\n")
                  .replace(/(\/uploads\/[^\s)]+)/gi, "\n\n$1\n\n")
                  // Cada linha de bullet "• Algo: valor" vira seu próprio parágrafo
                  .replace(/\n([•\-])/g, "\n\n$1")
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

                  // Grava o intent não atendido para o "Mapa de Intents Não Atendidos"
                  // Categoriza a mensagem do visitante por palavras-chave
                  const intentMsg = data.content?.slice(0, 300) ?? '';
                  const categorizeIntent = (msg: string): string => {
                    const m = msg.toLowerCase();
                    if (/garantia|assistência|técnico|manutenção|defeito|quebr|dano/.test(m))   return 'Garantia / Assistência Técnica';
                    if (/prazo|entrega|frete|envio|chegou|rastreio|transportadora/.test(m))      return 'Prazo de Entrega / Frete';
                    if (/preço|valor|desconto|promoção|custo|orçamento/.test(m))                return 'Preço / Orçamento';
                    if (/parcela|crédito|boleto|pix|pagamento|financiamento/.test(m))           return 'Forma de Pagamento';
                    if (/voltagem|energia|elétrico|tensão|amper|watt/.test(m))                  return 'Especificação Elétrica';
                    if (/dimensão|tamanho|peso|altura|largura|comprimento/.test(m))             return 'Dimensões / Especificações';
                    if (/nota fiscal|nfe|danfe|xml|faturamento|cnpj/.test(m))                   return 'Nota Fiscal / Faturamento';
                    if (/personaliz|customiz|adapt|modific|especial/.test(m))                   return 'Personalização / Adaptação';
                    if (/peça|reposição|substitui|reparo|conserto/.test(m))                     return 'Peças de Reposição';
                    if (/catálogo|manual|documentação|especificação técnica/.test(m))           return 'Documentação Técnica';
                    return 'Outros';
                  };
                  lcStorage.recordUnhandledIntent({
                    visitorId: currentVisitorId,
                    chatId: chat.id,
                    rawMessage: intentMsg,
                    category: categorizeIntent(intentMsg),
                  }).catch(() => {});
                }

                // Detectar desfecho usando rawReply (ainda contém as tags originais)
                const hasSale = /\[OUTCOME:SALE\]/i.test(rawReply);
                const hasNoSale = /\[OUTCOME:NO_SALE\]/i.test(rawReply);
                // Se tem [MAQUINAS_DADOS] ou [PECAS_DADOS] na mensagem atual, o NO_SALE deve ser IGNORADO
                const hasMaquinasDados = /\[MAQUINAS_DADOS:/i.test(rawReply);
                const hasPecasDados   = /\[PECAS_DADOS:/i.test(rawReply);
                // Também verifica o stage atual
                const currentStageNow = (await lcStorage.getVisitorById(currentVisitorId))?.pipelineStage ?? '';
                const isMaquinasStage = currentStageNow === 'maquinas' || hasMaquinasDados;
                const isPecasStage    = currentStageNow === 'pecas'    || hasPecasDados;
                // 🛡️ PROTEÇÃO AMPLIADA: todos os estágios qualificados nunca retrocedem para sem_resposta
                const PROTECTED_NO_SALE_STAGES = ['maquinas', 'pecas', 'pos_venda', 'finalizado_com_venda', 'finalizado_sem_venda', 'outros', 'vendido'];
                const isProtectedStage = PROTECTED_NO_SALE_STAGES.includes(currentStageNow) || hasMaquinasDados || hasPecasDados;

                if (hasSale) {
                  // ✅ OUTCOME:SALE detectado: apenas marca o pipeline e gera nota.
                  // NÃO fechar o chat — o visitante pode ainda estar no meio da conversa
                  // confirmando detalhes (CEP, forma de pagamento, etc). O chat fecha
                  // naturalmente pelo timer de 10min ou quando o visitante sair.
                  const note = await generateConversationNote(chat.id);
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "finalizado_com_venda");
                  if (note) {
                    await lcStorage.addVisitorNote(currentVisitorId, "Venda", note);
                    broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                  }
                  // Fagner define motivo automaticamente
                  await lcStorage.setChatCloseReason(chat.id, "venda_fechada").catch(() => {});
                  // ✅ NÃO fechar nem limpar sessão — visitante ainda pode confirmar CEP, pagamento, etc.
                  broadcastPipelineUpdate(currentVisitorId, "finalizado_com_venda");
                } else if (hasNoSale && !isProtectedStage) {
                  // NO_SALE só muda stage para sem_resposta se o visitante NÃO estiver em estágio protegido
                  const note = await generateConversationNote(chat.id);
                  await lcStorage.updateVisitorPipeline(currentVisitorId, "sem_resposta");
                  if (note) {
                    await lcStorage.addVisitorNote(currentVisitorId, "Sem Venda", note);
                    broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                  }
                  await lcStorage.setChatCloseReason(chat.id, "venda_cancelada").catch(() => {});
                  broadcastPipelineUpdate(currentVisitorId, "sem_resposta");
                } else if (hasNoSale && isProtectedStage) {
                  console.log(`[LiveChat] NO_SALE ignorado — visitante ${currentVisitorId} está em estágio protegido: ${currentStageNow}`);
                }

                // ── Detectar tags de estágio [STAGE:...] ──
                const stageTagMatch = rawReply.match(/\[STAGE:(pos_venda|outros|maquinas|pecas)\]/i);
                if (stageTagMatch) {
                  const newStage = stageTagMatch[1].toLowerCase() as string;
                  await lcStorage.updateVisitorPipeline(currentVisitorId, newStage);
                  broadcastPipelineUpdate(currentVisitorId, newStage);
                  console.log(`[LiveChat] Visitante ${currentVisitorId} movido para '${newStage}' via tag do Fagner`);

                  // Para "outros": cancelar follow-up timers (não faz sentido perguntar
                  // "Ainda posso ajudar?" para quem enviou currículo ou quer falar com pessoa específica)
                  if (newStage === 'outros' || newStage === 'maquinas' || newStage === 'pecas') {
                    clearFollowUpTimers(currentVisitorId);
                    console.log(`[LiveChat] Follow-up timers cancelados para visitante ${currentVisitorId} (estágio: ${newStage})`);
                  }
                } else {
                  // Fallback: detecção por regex na mensagem do USUÁRIO (para capturar intenção não marcada pelo Gemini)
                  const intentFromUserMsg = detectStageIntent(combinedContent);
                  if (intentFromUserMsg) {
                    await lcStorage.updateVisitorPipeline(currentVisitorId, intentFromUserMsg);
                    broadcastPipelineUpdate(currentVisitorId, intentFromUserMsg);
                    console.log(`[LiveChat] Visitante ${currentVisitorId} movido para '${intentFromUserMsg}' via regex na mensagem do user`);

                    // Para "outros": cancelar follow-up timers também no fallback regex
                    if (intentFromUserMsg === 'outros') {
                      clearFollowUpTimers(currentVisitorId);
                      console.log(`[LiveChat] Follow-up timers cancelados para visitante ${currentVisitorId} (estágio: outros, via regex)`);
                    }
                  }
                }

                // ── Detectar tag de dados de pós venda [POS_VENDA_DADOS:{...}] ──
                // Extração robusta por chaves balanceadas — o regex [\ s\ S]*?] quebrava
                // se o JSON continha ] em qualquer valor (datas, arrays, URLs, etc.)
                const posVendaTagIdx = rawReply.indexOf('[POS_VENDA_DADOS:');
                const posVendaTagMatch = posVendaTagIdx !== -1 ? ((): [string, string] | null => {
                  const jsonStart = rawReply.indexOf('{', posVendaTagIdx);
                  if (jsonStart === -1) return null;
                  let depth = 0, jsonEnd = -1;
                  for (let i = jsonStart; i < rawReply.length; i++) {
                    if (rawReply[i] === '{') depth++;
                    else if (rawReply[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
                  }
                  return jsonEnd !== -1 ? [rawReply, rawReply.substring(jsonStart, jsonEnd + 1)] : null;
                })() : null;
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

                    if (posVendaData.cnpjCpf) {
                      const cv = await lcStorage.getVisitorById(currentVisitorId);
                      if (cv?.posVendaCnpjData) {
                         const pj = typeof cv.posVendaCnpjData === 'string' ? JSON.parse(cv.posVendaCnpjData) : cv.posVendaCnpjData;
                         posVendaData.cnpjData = pj;
                      }
                    }

                    // ── Criar OS no RD Station CRM (background, não bloqueia o chat) ──
                    if (isRdCrmConfigured()) {
                      // Gera nota de conversa ANTES de criar o card (registra contexto completo)
                      const noteAntesCrmPv = await generateProgressiveNote(chat.id).catch(() => null);
                      if (noteAntesCrmPv) {
                        await lcStorage.addVisitorNote(currentVisitorId, "Atendimento", noteAntesCrmPv).catch(() => {});
                        broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                      }
                      // Nota inicial: IA iniciando criação do card
                      await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", "⏳ Iniciando criação de card no RD Station CRM...");
                      broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });

                      (async () => {
                        try {
                          // Coletar mensagens do chat para o relatório
                          const recentMessages = await lcStorage.listMessagesByChat(chat.id);

                          // Snippet compacto (150 chars/msg) — usado como contexto para a análise do Gemini
                          const snippet = recentMessages
                            .slice(-30)
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[POS_VENDA_DADOS:[\s\S]*?\]/gi, '')
                                .trim();
                              return `${who} ${clean.slice(0, 150)}`;
                            })
                            .filter(Boolean)
                            .join('\n');

                          // Transcrição completa — vai para a seção de histórico do relatório
                          const transcricaoCompleta = recentMessages
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[POS_VENDA_DADOS:[\s\S]*?\]/gi, '')
                                .replace(/\[PRODUTO_IDENTIFICADO:[^\]]+\]/gi, '')
                                .trim();
                              return clean ? `${who} ${clean}` : null;
                            })
                            .filter(Boolean)
                            .join('\n\n');

                          // Gerar relatório via Gemini
                          const relatorio = await generatePosVendaReport({
                            nome:                posVendaData.nome,
                            telefone:            posVendaData.telefone,
                            email:               posVendaData.email       ?? null,
                            cnpjCpf:             posVendaData.cnpjCpf     ?? null,
                            notaPedido:          posVendaData.notaPedido  ?? null,
                            problema:            posVendaData.problema,
                            cnpjData:            posVendaData.cnpjData,
                            conversationSnippet: snippet,
                            transcricaoCompleta: transcricaoCompleta,
                          });

                          // Criar OS no RD CRM
                          // Extrai o resumo gerado pelo Gemini para usar em "Informações Complementares"
                          // O relatório completo vai para as Anotações; o resumo vai para o campo do deal
                          const conversationSummary = (() => {
                            // Tenta extrair o bloco de ANÁLISE FAGNER IA como resumo, ou usa
                            // a primeira parte do relatório (Identificação + Problema) até 400 chars
                            const analiseMatch = relatorio.match(/ANÁLISE FAGNER IA\n([\s\S]*?)$/i);
                            if (analiseMatch && analiseMatch[1]?.trim()) {
                              return analiseMatch[1].trim().slice(0, 400);
                            }
                            // Fallback: extrai a linha do problema
                            const problemaMatch = relatorio.match(/PROBLEMA RELATADO\n\s*([\s\S]*?)(?:\n\n|$)/i);
                            if (problemaMatch && problemaMatch[1]?.trim()) {
                              return `Problema: ${problemaMatch[1].trim().slice(0, 300)}`;
                            }
                            return `${posVendaData.problema ?? 'Suporte pós-venda'}`.slice(0, 400);
                          })();

                          // ── Resolver owner via rodízio do funil pos_venda (persistido no banco) ──
                          // Idêntico ao padrão já usado em Máquinas e Peças.
                          // Garante que a configuração do painel de Settings (Lucimara / Melissa Bueno)
                          // seja respeitada — a env var RD_CRM_OWNER_POS_VENDA_ID fica como fallback.
                          let posVendaOwnerId: string | undefined;
                          try {
                            const rotationOwnerPv = await lcStorage.getNextOwnerForFunnel('pos_venda');
                            if (rotationOwnerPv) {
                              posVendaOwnerId = rotationOwnerPv;
                              console.log(`[LiveChat] Owner PÓS VENDA via rodízio: ${posVendaOwnerId}`);
                            }
                          } catch (rotErrPv: any) {
                            console.warn(`[LiveChat] Falha no rodízio de pós_venda:`, rotErrPv.message);
                          }

                          const dealId = await createPosVendaOS(
                            currentVisitorId,
                            {
                              nome:                posVendaData.nome,
                              telefone:            posVendaData.telefone,
                              email:               posVendaData.email       ?? undefined,
                              cnpjCpf:             posVendaData.cnpjCpf     ?? undefined,
                              notaPedido:          posVendaData.notaPedido  ?? undefined,
                              problema:            posVendaData.problema,
                              cnpjData:            posVendaData.cnpjData    ?? undefined,
                              conversationSummary: conversationSummary,
                              ownerId:             posVendaOwnerId,
                            },
                            relatorio
                          );

                          // Nota de sucesso com link clicável
                          const dealUrl = `https://crm.rdstation.com/app/deals/${dealId}`;
                          await lcStorage.addVisitorNote(
                            currentVisitorId,
                            "RD CRM",
                            `✅ Card criado no RD Station CRM!\nID do Deal: ${dealId}\n${dealUrl}`
                          );
                          // Salva o dealId no visitor para contabilizar no funil "Lead no CRM"
                          await lcStorage.setRdCrmDealId(currentVisitorId, dealId).catch(() => {});
                          // Fagner define motivo automaticamente
                          await lcStorage.setChatCloseReason(chat.id, "atendimento_concluido").catch(() => {});
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });

                          // Notificar painel admin com o link da OS criada
                          broadcastToAgents({
                            type: "RD_CRM_OS_CREATED",
                            visitorId: currentVisitorId,
                            dealId,
                            dealUrl,
                          });

                          console.log(`[RD CRM] ✅ OS criada no RD CRM para visitante ${currentVisitorId}: ${dealId}`);
                        } catch (crmErr: any) {
                          console.error(`[RD CRM] ❌ Falha ao criar OS:`, crmErr.message);
                          // Nota de falha visível no painel
                          await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", `❌ Falha ao criar card no RD CRM\nMotivo: ${crmErr.message}`).catch(() => {});
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                        }
                      })();
                    } else {
                      console.log("[RD CRM] Integração desativada (variáveis de ambiente não configuradas).");
                      await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", "⚠️ Integração com RD Station CRM não configurada. Configure RD_CRM_CLIENT_ID e RD_CRM_CLIENT_SECRET para ativar a criação automática de cards.").catch(() => {});
                    }
                  } catch (parseErr: any) {
                    console.warn("[LiveChat] Falha ao parsear POS_VENDA_DADOS:", parseErr.message);
                  }
                }

                // ── Detectar tag de dados de MÁQUINAS [MAQUINAS_DADOS:{...}] ──
                // Extração robusta por chaves balanceadas
                const maquinasTagIdx = rawReply.indexOf('[MAQUINAS_DADOS:');
                const maquinasTagMatch = maquinasTagIdx !== -1 ? ((): [string, string] | null => {
                  const jsonStart = rawReply.indexOf('{', maquinasTagIdx);
                  if (jsonStart === -1) return null;
                  let depth = 0, jsonEnd = -1;
                  for (let i = jsonStart; i < rawReply.length; i++) {
                    if (rawReply[i] === '{') depth++;
                    else if (rawReply[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
                  }
                  return jsonEnd !== -1 ? [rawReply, rawReply.substring(jsonStart, jsonEnd + 1)] : null;
                })() : null;
                if (maquinasTagMatch) {
                  try {
                    const maqData = JSON.parse(maquinasTagMatch[1].trim());
                    // Salva TODOS os dados de máquinas no visitante (incluindo campos específicos do funil)
                    await lcStorage.updateVisitorMaquinasData(currentVisitorId, {
                      nome:             maqData.nome            ?? null,
                      telefone:         maqData.telefone        ?? null,
                      email:            maqData.email           ?? null,
                      cnpjCpf:          maqData.cnpjCpf         ?? null,
                      maquinaDesejada:  maqData.maquinaDesejada ?? null,
                      produtoFabricado: maqData.produtoFabricado ?? null,
                      volumeProducao:   maqData.volumeProducao  ?? null,
                      qualificacaoSDR:  maqData.qualificacaoSDR ?? null,
                      clienteNovo:      maqData.clienteNovo     ?? null,
                    });
                    // Atualiza pipeline para maquinas
                    await lcStorage.updateVisitorPipeline(currentVisitorId, "maquinas");
                    broadcastPipelineUpdate(currentVisitorId, "maquinas");
                    // Busca visitante atualizado e faz broadcast para o dashboard atualizar "Sobre o Cliente" em tempo real
                    const updatedMaqVisitor = await lcStorage.getVisitorById(currentVisitorId);
                    broadcastToAgents({
                      type: "VISITOR_UPDATED",
                      visitorId: currentVisitorId,
                      visitor: updatedMaqVisitor,
                    });
                    broadcastToAgents({
                      type: "VISITOR_MAQUINAS_UPDATED",
                      visitorId: currentVisitorId,
                      maquinasData: maqData, // FIX: frontend lê "maquinasData", não "maqData"
                    });
                    console.log(`[LiveChat] Dados de máquinas salvos e broadcast feito para visitante ${currentVisitorId}`);

                    // FIX: Fecha o chat IMEDIATAMENTE após salvar os dados da máquina,
                    // sem esperar a criação do deal no RD CRM (que pode demorar 10-30s).
                    // Isso garante que o card sai de "Em Atendimento" no dashboard em tempo real.
                    clearFollowUpTimers(currentVisitorId);
                    await lcStorage.setChatCloseReason(chat.id, "atendimento_concluido").catch(() => {});
                    await lcStorage.closeChat(chat.id).catch(() => {});
                    broadcastToAgents({ type: "CHAT_CLOSED", chatId: chat.id, visitorId: currentVisitorId });
                    console.log(`[LiveChat] Chat ${chat.id} fechado imediatamente após [MAQUINAS_DADOS] — aguardando criação do deal no RD CRM em background.`);

                    // CNPJ data — tenta carregar do cache do banco primeiro
                    if (maqData.cnpjCpf) {
                      const cv = await lcStorage.getVisitorById(currentVisitorId);
                      if (cv?.posVendaCnpjData) {
                        // Cache disponível — usa direto
                        const pj = typeof cv.posVendaCnpjData === 'string' ? JSON.parse(cv.posVendaCnpjData) : cv.posVendaCnpjData;
                        maqData.cnpjData = pj;
                      } else {
                        // FIX Bug 1: cache ausente — busca razão social na CNPJ.ws para criar empresa correta no CRM
                        const docDigits = maqData.cnpjCpf.replace(/\D/g, '');
                        if (docDigits.length === 14) {
                          try {
                            const cnpjRes = await fetch(`https://publica.cnpj.ws/cnpj/${docDigits}`, { signal: AbortSignal.timeout(6000) });
                            if (cnpjRes.ok) {
                              const cnpjJson = await cnpjRes.json();
                              maqData.cnpjData = {
                                nome:      cnpjJson.razao_social ?? maqData.nome,
                                fantasia:  cnpjJson.estabelecimento?.nome_fantasia ?? undefined,
                                cnpj:      docDigits,
                                municipio: cnpjJson.estabelecimento?.cidade?.nome ?? undefined,
                                uf:        cnpjJson.estabelecimento?.estado?.sigla ?? undefined,
                                bairro:    cnpjJson.estabelecimento?.bairro ?? undefined,
                              };
                              console.log(`[LiveChat] CNPJ lookup (fallback pré-CRM): ${maqData.cnpjData.nome}`);
                              // Persiste no banco para sessões futuras
                              await lcStorage.updateVisitorPosVendaData(currentVisitorId, { cnpjData: maqData.cnpjData }).catch(() => {});
                            }
                          } catch (cnpjErr: any) {
                            console.warn(`[LiveChat] CNPJ lookup fallback falhou: ${cnpjErr.message} — empresa criada pelo nome do cliente`);
                          }
                        }
                      }
                    }


                    // ── Criar deal no RD Station CRM funil MÁQUINAS 2.0 ──
                    if (isRdCrmConfigured()) {
                      // Gera nota de conversa ANTES de criar o card (registra contexto completo)
                      const noteAntesCrmMaq = await generateProgressiveNote(chat.id).catch(() => null);
                      if (noteAntesCrmMaq) {
                        await lcStorage.addVisitorNote(currentVisitorId, "Atendimento", noteAntesCrmMaq).catch(() => {});
                        broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                      }
                      await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", "⏳ Criando card no funil MÁQUINAS 2.0...");
                      broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });

                      (async () => {
                        try {
                          const recentMessages = await lcStorage.listMessagesByChat(chat.id);

                          // Snippet compacto
                          const snippet = recentMessages
                            .slice(-30)
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[MAQUINAS_DADOS:[\s\S]*?\]/gi, '')
                                .trim();
                              return `${who} ${clean.slice(0, 150)}`;
                            })
                            .filter(Boolean)
                            .join('\n');

                          // Transcrição completa
                          const transcricaoCompleta = recentMessages
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[MAQUINAS_DADOS:[\s\S]*?\]/gi, '')
                                .replace(/\[PRODUTO_IDENTIFICADO:[^\]]+\]/gi, '')
                                .trim();
                              return clean ? `${who} ${clean}` : null;
                            })
                            .filter(Boolean)
                            .join('\n\n');

                          // Gerar relatório Sales via generateMaquinasReport
                          const relatorio = await generateMaquinasReport({
                            nome:               maqData.nome,
                            telefone:           maqData.telefone,
                            email:              maqData.email      ?? null,
                            cnpjCpf:            maqData.cnpjCpf    ?? null,
                            maquinaDesejada:    maqData.maquinaDesejada,
                            detalhes:           maqData.detalhes   ?? null,
                            produtoFabricado:   maqData.produtoFabricado ?? null,
                            volumeProducao:     maqData.volumeProducao  ?? null,
                            clienteNovo:        maqData.clienteNovo     ?? null,
                            qualificacaoSDR:    maqData.qualificacaoSDR ?? null,
                            cnpjData:           maqData.cnpjData,
                            conversationSnippet: snippet,
                            transcricaoCompleta: transcricaoCompleta,
                          });

                          // Resumo para informações complementares do deal
                          const conversationSummary = `Máquina: ${maqData.maquinaDesejada}. ${maqData.detalhes || ''}`.trim().slice(0, 400);

                          // Resolver owner via rodízio do funil maquinas (persistido no banco)
                          let ownerId: string | undefined;
                          try {
                            const rotationOwnerId = await lcStorage.getNextOwnerForFunnel('maquinas');
                            if (rotationOwnerId) {
                              ownerId = rotationOwnerId;
                              console.log(`[LiveChat] Owner MÁQUINAS via rodízio: ${ownerId}`);
                            }
                          } catch (rotErr: any) {
                            console.warn(`[LiveChat] Falha no rodízio de máquinas:`, rotErr.message);
                          }

                          const dealId = await createMaquinasOS(
                            currentVisitorId,
                            {
                              nome:               maqData.nome,
                              telefone:           maqData.telefone,
                              email:              maqData.email      ?? undefined,
                              cnpjCpf:            maqData.cnpjCpf    ?? undefined,
                              cnpjData:           maqData.cnpjData   ?? undefined,
                              maquinaDesejada:    maqData.maquinaDesejada,
                              detalhes:           maqData.detalhes   ?? undefined,
                              // FALLBACK: se o JSON do Fagner não trouxe esses campos neste turno,
                              // usa o que já está salvo no DB (coletado em turnos anteriores)
                              produtoFabricado:   maqData.produtoFabricado   ?? (updatedMaqVisitor as any)?.maquinaProdutoFabricado ?? undefined,
                              volumeProducao:     maqData.volumeProducao     ?? (updatedMaqVisitor as any)?.maquinaVolumeProducao   ?? undefined,
                              clienteNovo:        maqData.clienteNovo        ?? undefined,
                              qualificacaoSDR:    maqData.qualificacaoSDR    ?? (updatedMaqVisitor as any)?.maquinaQualificacaoSDR  ?? undefined,
                              conversationSummary: conversationSummary,
                              ownerId:            ownerId,
                            },
                            relatorio
                          );

                          const dealUrl = `https://crm.rdstation.com/app/deals/${dealId}`;
                          await lcStorage.addVisitorNote(
                            currentVisitorId,
                            "RD CRM",
                            `✅ Card MÁQUINAS criado no RD Station CRM!\nFunil: MÁQUINAS 2.0\nID do Deal: ${dealId}\n${dealUrl}`
                          );
                          // Salva o dealId no visitor para contabilizar no funil "Lead no CRM"
                          await lcStorage.setRdCrmDealId(currentVisitorId, dealId).catch(() => {});
                          // Nota: o chat já foi fechado sincronamente antes de entrar neste bloco async.
                          // Aqui apenas notificamos o agente sobre o card do RD CRM criado.
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                          broadcastToAgents({
                            type: "RD_CRM_OS_CREATED",
                            visitorId: currentVisitorId,
                            dealId,
                            dealUrl,
                          });
                          console.log(`[RD CRM] ✅ Deal MÁQUINAS criado para visitante ${currentVisitorId}: ${dealId}`);
                        } catch (crmErr: any) {
                          console.error(`[RD CRM] ❌ Falha ao criar deal MÁQUINAS:`, crmErr.message);
                          await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", `❌ Falha ao criar card MÁQUINAS\nMotivo: ${crmErr.message}`).catch(() => {});
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                        }
                      })();
                    }
                  } catch (parseErr: any) {
                    console.warn("[LiveChat] Falha ao parsear MAQUINAS_DADOS:", parseErr.message);
                  }
                }

                // ── 🛡️ FALLBACK SERVER-SIDE: MAQUINAS_DADOS não emitida pela IA ────────────────
                // Quando o Fagner diz o texto de encerramento mas NÃO inclui a tag [MAQUINAS_DADOS]
                // (comportamento intermitente do Gemini), o servidor reconstrói os dados
                // diretamente do OVERVIEW confirmado, que já está salvo no banco como chunks.
                // GARANTE que os dados nunca se percam independentemente da IA.
                if (!maquinasTagMatch) {
                  const hasMaquinasFarewell = /registrei sua solici|equipe comercial entrar|orçamento detalhado/i.test(rawReply);
                  if (hasMaquinasFarewell) {
                    try {
                      const visitorForFallback = await lcStorage.getVisitorById(currentVisitorId);
                      // Só ativa se:  1) estágio é maquinas  2) os campos ainda não foram salvos
                      const jaTemDados = visitorForFallback?.maquinaDesejada || visitorForFallback?.maquinaProdutoFabricado;
                      if (visitorForFallback?.pipelineStage === 'maquinas' && !jaTemDados) {
                        console.warn(`[LiveChat] ⚠️ FALLBACK ATIVADO: Fagner disse encerramento sem [MAQUINAS_DADOS] — reconstruindo do OVERVIEW`);

                        const allMsgs = await lcStorage.listMessagesByChat(chat.id);

                        // Extrai o valor de um campo do OVERVIEW a partir dos chunks salvos
                        // Ex: "• Produto fabricado: Paletes" → "Paletes"
                        const parseOvField = (...labels: string[]): string | null => {
                          for (const label of labels) {
                            const re = new RegExp(`^\\s*[•\\-]\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'i');
                            const msg = [...allMsgs].reverse().find(m => m.sender === 'ai' && re.test(m.content.trim()));
                            if (msg) {
                              const cap = msg.content.trim().match(re);
                              if (cap?.[1]) return cap[1].trim();
                            }
                          }
                          return null;
                        };

                        const maqDataFallback = {
                          nome:             parseOvField('Nome', 'Cliente')                          ?? visitorForFallback.name ?? 'Não informado',
                          telefone:         parseOvField('Telefone', 'WhatsApp', 'Tel')              ?? null,
                          email:            parseOvField('E-mail', 'Email')                          ?? null,
                          cnpjCpf:          parseOvField('CPF/CNPJ', 'CNPJ', 'CPF')                 ?? null,
                          maquinaDesejada:  parseOvField('Máquina', 'Equipamento', 'Produto')        ?? 'Não informado',
                          detalhes:         parseOvField('Detalhes', 'Observação')                   ?? null,
                          produtoFabricado: parseOvField('Produto fabricado', 'Produto')             ?? null,
                          volumeProducao:   parseOvField('Volume de produção', 'Volume')             ?? null,
                          clienteNovo:      'SIM',
                          qualificacaoSDR:  '2',
                          cnpjData:         visitorForFallback.posVendaCnpjData
                            ? (typeof visitorForFallback.posVendaCnpjData === 'string'
                              ? JSON.parse(visitorForFallback.posVendaCnpjData)
                              : visitorForFallback.posVendaCnpjData)
                            : undefined,
                        };

                        console.log(`[LiveChat] Fallback MAQUINAS_DADOS reconstruído:`, {
                          maquina: maqDataFallback.maquinaDesejada,
                          produto: maqDataFallback.produtoFabricado,
                          volume:  maqDataFallback.volumeProducao,
                          nome:    maqDataFallback.nome,
                          cnpj:    maqDataFallback.cnpjCpf,
                        });

                        // Salva no banco (atualiza painel do visitante)
                        await lcStorage.updateVisitorMaquinasData(currentVisitorId, {
                          nome:             maqDataFallback.nome,
                          telefone:         maqDataFallback.telefone,
                          email:            maqDataFallback.email,
                          cnpjCpf:          maqDataFallback.cnpjCpf,
                          maquinaDesejada:  maqDataFallback.maquinaDesejada,
                          produtoFabricado: maqDataFallback.produtoFabricado,
                          volumeProducao:   maqDataFallback.volumeProducao,
                          qualificacaoSDR:  maqDataFallback.qualificacaoSDR,
                          clienteNovo:      maqDataFallback.clienteNovo,
                        });
                        await lcStorage.updateVisitorPipeline(currentVisitorId, 'maquinas');
                        // Broadcast para o dashboard atualizar "Sobre o Cliente" imediatamente
                        const updatedFbVisitor = await lcStorage.getVisitorById(currentVisitorId);
                        broadcastToAgents({ type: 'VISITOR_UPDATED', visitorId: currentVisitorId, visitor: updatedFbVisitor });
                        broadcastToAgents({ type: 'VISITOR_MAQUINAS_UPDATED', visitorId: currentVisitorId, maqData: maqDataFallback });

                        // FIX: Fecha o chat IMEDIATAMENTE, sem esperar o RD CRM (igual ao caminho principal)
                        clearFollowUpTimers(currentVisitorId);
                        await lcStorage.setChatCloseReason(chat.id, 'atendimento_concluido').catch(() => {});
                        await lcStorage.closeChat(chat.id).catch(() => {});
                        broadcastToAgents({ type: 'CHAT_CLOSED', chatId: chat.id, visitorId: currentVisitorId });
                        console.log(`[LiveChat] [FALLBACK] Chat ${chat.id} fechado imediatamente — aguardando deal no RD CRM em background.`);

                        // Cria deal no RD CRM (mesmo fluxo do caminho normal)
                        if (isRdCrmConfigured()) {
                          // Gera nota ANTES de criar o card fallback
                          const noteAntesFallback = await generateProgressiveNote(chat.id).catch(() => null);
                          if (noteAntesFallback) {
                            await lcStorage.addVisitorNote(currentVisitorId, 'Atendimento', noteAntesFallback).catch(() => {});
                            broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                          }
                          await lcStorage.addVisitorNote(currentVisitorId, 'RD CRM', '⏳ [FALLBACK] Criando card MÁQUINAS (tag não emitida pela IA)...');
                          broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });

                          (async () => {
                            try {
                              const recentForReport = await lcStorage.listMessagesByChat(chat.id);
                              const snippetFb = recentForReport.slice(-20)
                                .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                                .map(m => `${m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]'} ${m.content.slice(0, 120)}`)
                                .join('\n');

                              const relatorioFb = await generateMaquinasReport({
                                nome: maqDataFallback.nome, telefone: maqDataFallback.telefone,
                                email: maqDataFallback.email ?? null, cnpjCpf: maqDataFallback.cnpjCpf ?? null,
                                maquinaDesejada: maqDataFallback.maquinaDesejada,
                                detalhes: maqDataFallback.detalhes ?? null,
                                produtoFabricado: maqDataFallback.produtoFabricado ?? null,
                                volumeProducao: maqDataFallback.volumeProducao ?? null,
                                clienteNovo: maqDataFallback.clienteNovo ?? null,
                                qualificacaoSDR: maqDataFallback.qualificacaoSDR ?? null,
                                cnpjData: maqDataFallback.cnpjData,
                                conversationSnippet: snippetFb, transcricaoCompleta: snippetFb,
                              });

                              let ownerIdFb: string | undefined;
                              try { ownerIdFb = await lcStorage.getNextOwnerForFunnel('maquinas') ?? undefined; } catch {}

                              const dealIdFb = await createMaquinasOS(currentVisitorId, { ...maqDataFallback, ownerId: ownerIdFb }, relatorioFb);
                              const dealUrlFb = `https://crm.rdstation.com/app/deals/${dealIdFb}`;
                              await lcStorage.addVisitorNote(currentVisitorId, 'RD CRM', `✅ [FALLBACK] Card MÁQUINAS criado!\nID: ${dealIdFb}\n${dealUrlFb}`);
                              // Salva o dealId no visitor para contabilizar no funil "Lead no CRM"
                              await lcStorage.setRdCrmDealId(currentVisitorId, dealIdFb).catch(() => {});
                              // Nota: o chat já foi fechado antes de entrar neste bloco async.
                              broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                              broadcastToAgents({ type: 'RD_CRM_OS_CREATED', visitorId: currentVisitorId, dealId: dealIdFb, dealUrl: dealUrlFb });
                              console.log(`[RD CRM] ✅ [FALLBACK] Deal MÁQUINAS criado para visitante ${currentVisitorId}: ${dealIdFb}`);
                            } catch (fbErr: any) {
                              console.error(`[RD CRM] ❌ [FALLBACK] Falha:`, fbErr.message);
                              await lcStorage.addVisitorNote(currentVisitorId, 'RD CRM', `❌ [FALLBACK] Falha ao criar card MÁQUINAS\n${fbErr.message}`).catch(() => {});
                              broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                            }
                          })();
                        }
                      }
                    } catch (fallbackErr: any) {
                      console.error(`[LiveChat] ❌ Fallback MAQUINAS_DADOS falhou:`, fallbackErr.message);
                    }
                  }
                }


                // Extração robusta por chaves balanceadas
                const pecasTagIdx = rawReply.indexOf('[PECAS_DADOS:');
                const pecasTagMatch = pecasTagIdx !== -1 ? ((): [string, string] | null => {
                  const jsonStart = rawReply.indexOf('{', pecasTagIdx);
                  if (jsonStart === -1) return null;
                  let depth = 0, jsonEnd = -1;
                  for (let i = jsonStart; i < rawReply.length; i++) {
                    if (rawReply[i] === '{') depth++;
                    else if (rawReply[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
                  }
                  return jsonEnd !== -1 ? [rawReply, rawReply.substring(jsonStart, jsonEnd + 1)] : null;
                })() : null;
                if (pecasTagMatch) {
                  try {
                    const pecasData = JSON.parse(pecasTagMatch[1].trim());
                    // Salva dados no visitante (campos base + pecaDesejada + eCliente)
                    await lcStorage.updateVisitorPecasData(currentVisitorId, {
                      nome:          pecasData.nome       ?? null,
                      telefone:      pecasData.telefone   ?? null,
                      email:         pecasData.email      ?? null,
                      cnpjCpf:       pecasData.cnpjCpf    ?? null,
                      pecaDesejada:  pecasData.pecaDesejada ?? null,
                      pecasECliente: pecasData.eCliente   ?? null,
                    });
                    // Atualiza pipeline para pecas
                    await lcStorage.updateVisitorPipeline(currentVisitorId, "pecas");
                    broadcastPipelineUpdate(currentVisitorId, "pecas");
                    broadcastToAgents({
                      type: "VISITOR_PECAS_UPDATED",
                      visitorId: currentVisitorId,
                      pecasData,
                    });
                    console.log(`[LiveChat] Dados de peças salvos para visitante ${currentVisitorId}`);

                    // CNPJ data
                    if (pecasData.cnpjCpf) {
                      const cv = await lcStorage.getVisitorById(currentVisitorId);
                      if (cv?.posVendaCnpjData) {
                        const pj = typeof cv.posVendaCnpjData === 'string' ? JSON.parse(cv.posVendaCnpjData) : cv.posVendaCnpjData;
                        pecasData.cnpjData = pj;
                      }
                    }

                    // ── Criar deal no RD Station CRM funil PEÇAS 2.0 ──
                    if (isRdCrmConfigured()) {
                      // Gera nota de conversa ANTES de criar o card (registra contexto completo)
                      const noteAntesCrmPecas = await generateProgressiveNote(chat.id).catch(() => null);
                      if (noteAntesCrmPecas) {
                        await lcStorage.addVisitorNote(currentVisitorId, "Atendimento", noteAntesCrmPecas).catch(() => {});
                        broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                      }
                      await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", "⏳ Criando card no funil PEÇAS 2.0...");
                      broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });

                      (async () => {
                        try {
                          const recentMessages = await lcStorage.listMessagesByChat(chat.id);

                          const snippet = recentMessages
                            .slice(-30)
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[PECAS_DADOS:[\s\S]*?\]/gi, '')
                                .trim();
                              return `${who} ${clean.slice(0, 150)}`;
                            })
                            .filter(Boolean)
                            .join('\n');

                          const transcricaoCompleta = recentMessages
                            .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
                            .map(m => {
                              const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
                              const clean = m.content
                                .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
                                .replace(/\[SCORE:\d+\]/gi, '')
                                .replace(/\[STAGE:[^\]]+\]/gi, '')
                                .replace(/\[PECAS_DADOS:[\s\S]*?\]/gi, '')
                                .replace(/\[PRODUTO_IDENTIFICADO:[^\]]+\]/gi, '')
                                .trim();
                              return clean ? `${who} ${clean}` : null;
                            })
                            .filter(Boolean)
                            .join('\n\n');

                          const relatorio = await generatePecasReport({
                            nome:                pecasData.nome,
                            telefone:            pecasData.telefone,
                            email:               pecasData.email      ?? null,
                            cnpjCpf:             pecasData.cnpjCpf    ?? null,
                            pecaDesejada:        pecasData.pecaDesejada,
                            eCliente:            pecasData.eCliente   ?? null,
                            cnpjData:            pecasData.cnpjData,
                            conversationSnippet: snippet,
                            transcricaoCompleta: transcricaoCompleta,
                          });

                          const conversationSummary = `Peça: ${pecasData.pecaDesejada}. É cliente: ${pecasData.eCliente ?? 'SIM'}`.trim().slice(0, 400);

                          // Rodízio do funil pecas
                          let ownerId: string | undefined;
                          try {
                            const rotationOwnerId = await lcStorage.getNextOwnerForFunnel('pecas');
                            if (rotationOwnerId) {
                              ownerId = rotationOwnerId;
                              console.log(`[LiveChat] Owner PEÇAS via rodízio: ${ownerId}`);
                            }
                          } catch (rotErr: any) {
                            console.warn(`[LiveChat] Falha no rodízio de peças:`, rotErr.message);
                          }

                          const dealId = await createPecasOS(
                            currentVisitorId,
                            {
                              nome:               pecasData.nome,
                              telefone:           pecasData.telefone,
                              email:              pecasData.email      ?? undefined,
                              cnpjCpf:            pecasData.cnpjCpf    ?? undefined,
                              cnpjData:           pecasData.cnpjData   ?? undefined,
                              pecaDesejada:       pecasData.pecaDesejada,
                              eCliente:           pecasData.eCliente   ?? undefined,
                              conversationSummary: conversationSummary,
                              ownerId:            ownerId,
                            },
                            relatorio
                          );

                          const dealUrl = `https://crm.rdstation.com/app/deals/${dealId}`;
                          await lcStorage.addVisitorNote(
                            currentVisitorId,
                            "RD CRM",
                            `✅ Card PEÇAS criado no RD Station CRM!\nFunil: FUNIL PEÇAS 2.0\nID do Deal: ${dealId}\n${dealUrl}`
                          );
                          // Salva o dealId no visitor para contabilizar no funil "Lead no CRM"
                          await lcStorage.setRdCrmDealId(currentVisitorId, dealId).catch(() => {});
                          await lcStorage.setChatCloseReason(chat.id, "atendimento_concluido").catch(() => {});
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                          broadcastToAgents({
                            type: "RD_CRM_OS_CREATED",
                            visitorId: currentVisitorId,
                            dealId,
                            dealUrl,
                          });
                          console.log(`[RD CRM] ✅ Deal PEÇAS criado para visitante ${currentVisitorId}: ${dealId}`);
                        } catch (crmErr: any) {
                          console.error(`[RD CRM] ❌ Falha ao criar deal PEÇAS:`, crmErr.message);
                          await lcStorage.addVisitorNote(currentVisitorId, "RD CRM", `❌ Falha ao criar card PEÇAS\nMotivo: ${crmErr.message}`).catch(() => {});
                          broadcastToAgents({ type: "VISITOR_NOTE_ADDED", visitorId: currentVisitorId });
                        }
                      })();
                    }
                  } catch (parseErr: any) {
                    console.warn("[LiveChat] Falha ao parsear PECAS_DADOS:", parseErr.message);
                  }
                }

                // ── Detectar [VTEX_PEDIDO_INICIADO] — cliente autorizou pedido ─────────
                // Move o card imediatamente para "vendido" antes da coleta de dados
                if (rawReply.includes('[VTEX_PEDIDO_INICIADO]')) {
                  try {
                    await lcStorage.updateVisitorPipeline(currentVisitorId, 'vendido');
                    broadcastToAgents({ type: 'PIPELINE_UPDATED', visitorId: currentVisitorId, stage: 'vendido' });
                    await lcStorage.addVisitorNote(currentVisitorId, 'VTEX', '🛒 Cliente autorizou pedido — Fagner iniciando coleta de dados para checkout.');
                    broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                    console.log(`[VTEX Order] card do visitante ${currentVisitorId} movido para "vendido"`);
                  } catch (e: any) {
                    console.error('[VTEX Order] Falha ao mover para vendido:', e.message);
                  }
                }

                // ── Detectar [VTEX_ORDER_DADOS:{...}] — todos os dados coletados ───────
                const vtexOrderMatch = rawReply.match(/\[VTEX_ORDER_DADOS:([\s\S]*?)\]/);
                if (vtexOrderMatch) {
                  (async () => {
                    let orderData: VtexOrderData | null = null;
                    try {
                      orderData = JSON.parse(vtexOrderMatch[1].trim()) as VtexOrderData;
                    } catch (parseErr: any) {
                      console.warn('[VTEX Order] Falha ao parsear VTEX_ORDER_DADOS:', parseErr.message);
                      return;
                    }
                    try {
                      // 1. Nota interna: iniciando
                      await lcStorage.addVisitorNote(currentVisitorId, 'VTEX', '⏳ Montando carrinho e calculando frete...');
                      broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });

                      // 2. Garante que o card está em "vendido" (caso [VTEX_PEDIDO_INICIADO] não tenha sido lido)
                      await lcStorage.updateVisitorPipeline(currentVisitorId, 'vendido');

                      // 3. Monta cart completo na VTEX
                      const { orderFormId, checkoutLink, total, freteInfo } = await buildCart(orderData!);

                      // 4. Salva dados do pedido no visitante (aba "Sobre o cliente")
                      await lcStorage.updateVisitorOrderData(currentVisitorId, {
                        vtexOrderFormId: orderFormId,
                        vtexOrderStatus: 'link_gerado',
                        vtexOrderData: {
                          ...orderData,
                          checkoutLink,
                          total,
                          freteInfo,
                          geradoEm: new Date().toISOString(),
                        },
                      });

                      // 5. Nota de sucesso ao painel
                      const nomeProduto = orderData!.produto || 'Produto';
                      await lcStorage.addVisitorNote(
                        currentVisitorId, 'VTEX',
                        `✅ Link gerado com sucesso!\nProduto: ${nomeProduto}\nTotal: ${total}\nFrete: ${freteInfo.carrier} — ${freteInfo.priceFormatted} (${freteInfo.deliveryDays} dias úteis)\nLink: ${checkoutLink}`
                      );
                      broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                      broadcastToAgents({
                        type: 'VISITOR_ORDER_CREATED',
                        visitorId: currentVisitorId,
                        orderFormId,
                        checkoutLink,
                        total,
                      });

                      // 6. Envia link ao cliente (substitui a mensagem vaga do Fagner)
                      const freteTexto = freteInfo.deliveryDays > 0
                        ? `${freteInfo.carrier} — ${freteInfo.priceFormatted} (${freteInfo.deliveryDays} dias úteis)`
                        : `A combinar com nossa equipe`;
                      const linkMsg = [
                        `🛒 *Pedido pronto para finalizar!*`,
                        ``,
                        `📦 Produto: ${nomeProduto}`,
                        `💰 Total: ${total}`,
                        `🚚 Frete: ${freteTexto}`,
                        ``,
                        `Para finalizar, basta clicar no link abaixo e escolher sua forma de pagamento (PIX, Boleto ou Cartão) — todos os seus dados já estão preenchidos!`,
                        ``,
                        checkoutLink,
                        ``,
                        `_O link fica ativo por 1 hora. Se precisar de um novo é só pedir! 😊_`,
                      ].join('\n');

                      await lcStorage.createMessage({ chatId: chat.id, sender: 'ai', content: linkMsg });
                      sendToVisitor(currentVisitorId, {
                        type: 'CHAT_REPLY', chatId: chat.id, sender: 'ai',
                        content: linkMsg, timestamp: new Date().toISOString(),
                      });
                      broadcastToAgents({
                        type: 'CHAT_MESSAGE', chatId: chat.id, visitorId: currentVisitorId,
                        sender: 'ai', content: linkMsg, timestamp: new Date().toISOString(),
                      });

                      console.log(`[VTEX Order] ✅ Link gerado para ${currentVisitorId}: ${checkoutLink}`);

                    } catch (err: any) {
                      console.error('[VTEX Order] ❌ Erro ao gerar link:', err.message);
                      await lcStorage.addVisitorNote(currentVisitorId, 'VTEX', `❌ Falha ao gerar link: ${err.message}`).catch(() => {});
                      broadcastToAgents({ type: 'VISITOR_NOTE_ADDED', visitorId: currentVisitorId });
                      // Mensagem de fallback ao cliente
                      const errMsg = 'Tive um problema ao gerar o link de pagamento 😕 Vou acionar nossa equipe para te ajudar. Em breve entraremos em contato!';
                      await lcStorage.createMessage({ chatId: chat.id, sender: 'ai', content: errMsg });
                      sendToVisitor(currentVisitorId, { type: 'CHAT_REPLY', chatId: chat.id, sender: 'ai', content: errMsg, timestamp: new Date().toISOString() });
                    }
                  })();
                }
                // ── Controle de Follow-up Timers ─────────────────────────────────────────
                // Regra: NUNCA iniciar follow-ups quando o atendimento já foi concluído.
                // Detectamos conclusão por:
                //   1. Stage final persistido no banco
                //   2. Tags de dados na RESPOSTA ATUAL (antes do banco ser atualizado)
                //   3. OUTCOME:SALE detectado nesta mensagem
                try {
                  const visitorNow = await lcStorage.getVisitorById(currentVisitorId);
                  // Todos os stages onde o atendimento já foi encerrado ou é um fluxo gerenciado
                  const PROTECTED_STAGES = [
                    'outros',
                    'finalizado_com_venda',
                    'finalizado_sem_venda',
                    'pos_venda',
                    'maquinas',
                    'pecas',
                    'vendido',
                    'sem_resposta',
                  ];
                  // Também protege pela presença de tags de dados NA RESPOSTA ATUAL
                  // (o banco pode ainda não ter sido atualizado quando chegamos aqui)
                  const hasConclusionTag = posVendaTagMatch !== null
                    || maquinasTagMatch !== null
                    || pecasTagMatch !== null
                    || hasSale;

                  if (PROTECTED_STAGES.includes(visitorNow?.pipelineStage ?? '') || hasConclusionTag) {
                    // Garante que timers anteriores também sejam cancelados
                    clearFollowUpTimers(currentVisitorId);
                    console.log(`[LiveChat] Follow-up timers bloqueados — estágio: ${visitorNow?.pipelineStage}${hasConclusionTag ? ' (tag de conclusão detectada)' : ''}`);
                  } else {
                    startFollowUpTimers(currentVisitorId, chat.id);
                  }
                } catch {
                  // Fallback seguro: verificar stage antes de iniciar timer
                  // (nunca iniciar follow-up para stages finais mesmo em caso de exceção)
                  try {
                    const vFallback = await lcStorage.getVisitorById(currentVisitorId);
                    const SAFE_STAGES = ['maquinas','pecas','pos_venda','outros','finalizado_com_venda','finalizado_sem_venda','sem_resposta','vendido'];
                    if (SAFE_STAGES.includes(vFallback?.pipelineStage ?? '')) {
                      clearFollowUpTimers(currentVisitorId);
                    } else {
                      startFollowUpTimers(currentVisitorId, chat.id);
                    }
                  } catch { /* sem-op — melhor não iniciar timer do que crashar */ }
                } finally {
                  // SEMPRE libera o lock ao terminar — mesmo em exceção — para não bloquear msgs futuras
                  chatsBeingProcessed.delete(chat.id);
                }
              }, 15000); // 15 sec cooldown — Fagner aguarda 15s de silêncio antes de responder
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
            // Sem limite de 200 — o site pode ter milhares de acessos
            const [visitors, chats, stats] = await Promise.all([
              lcStorage.listAllVisitors(),
              lcStorage.listChats(undefined, 1000),
              lcStorage.getStats(),
            ]);

            const stages = ['novo_atendimento', 'em_atendimento', 'maquinas', 'pecas', 'pos_venda', 'finalizado_com_venda', 'finalizado_sem_venda', 'outros', 'sem_resposta'];
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

            // Attachments enviados pelo agente (imagens, PDFs, etc.)
            const agentAttachments: { url: string; name: string; mimeType: string; size?: number }[] = data.attachments ?? [];

            // Conteúdo de texto enviado pelo agente (vazio se for só attachment)
            const textContent = data.content ?? "";

            // Conteúdo salvo no banco: texto + referência de attachments (para histórico)
            const savedContent = textContent || (agentAttachments.length > 0
              ? `[AGENT_ATTACHMENTS:${JSON.stringify(agentAttachments)}]`
              : "");

            // Save agent message
            await lcStorage.createMessage({
              chatId: chat.id,
              sender: "agent",
              content: savedContent,
            });

            // Send to visitor — inclui attachments para renderização no widget
            sendToVisitor(chat.visitorId, {
              type: "CHAT_REPLY",
              chatId: chat.id,
              sender: "agent",
              content: textContent,
              attachments: agentAttachments.length > 0 ? agentAttachments : undefined,
              timestamp: new Date().toISOString(),
            });

            // Broadcast to other agents — usa campo separado para attachments
            // (NÃO embute [AGENT_ATTACHMENTS:] no content para não virar log oculto no painel)
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: chat.id,
              visitorId: chat.visitorId,
              sender: "agent",
              agentId: data.userId,
              content: textContent,
              attachments: agentAttachments.length > 0 ? agentAttachments : undefined,
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

            // Resolve nome do operador: prioriza o nome enviado pelo admin panel;
            // se não vier (ou vier igual ao userId = UUID), busca no banco pelo userId
            let operatorName: string = (data.operatorName as string) || "";
            const opIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operatorName);
            if (!operatorName || opIsUuid) {
              const userId = data.userId as string | undefined;
              if (userId) {
                try {
                  const agentUser = await import('../storage.js').then(m => m.storage.getUserSafeById(userId));
                  operatorName = agentUser?.name || agentUser?.username || operatorName || "Atendente";
                } catch {
                  operatorName = operatorName || "Atendente";
                }
              } else {
                operatorName = "Atendente";
              }
            }

            // Cancela imediatamente qualquer geração Gemini em andamento para este chat
            // (evita que Fagner entregue resposta após o operador ter assumido)
            cancelGeneration(chatToTake.id);

            await lcStorage.updateChat(chatToTake.id, {
              status: "human_active",
              agentId: data.userId,
              needsHuman: "false",
            });

            // Salva mensagem de sistema no histórico do chat
            await lcStorage.createMessage({
              chatId: chatToTake.id,
              sender: "system" as any,
              content: `${operatorName} iniciou o atendimento`,
            }).catch(() => {});

            const systemMsg = `${operatorName} iniciou o atendimento`;

            // Debug: verifica se o visitante está conectado
            const visConns = visitorConnections.get(chatToTake.visitorId);
            console.log(`[LiveChat] TAKE_OVER — visitorId=${chatToTake.visitorId} | conexões WS ativas: ${visConns?.size ?? 0}`);

            // Notifica o widget do visitante (via conexão WS do visitante)
            sendToVisitor(chatToTake.visitorId, {
              type: "AGENT_JOINED",
              operatorName,
              message: systemMsg,
              chatId: chatToTake.id,
            });

            // Fallback: também envia como CHAT_REPLY para garantir que apareça no widget
            // (CHAT_REPLY é o mesmo canal que o Fagner usa para enviar respostas)
            sendToVisitor(chatToTake.visitorId, {
              type: "SYSTEM_MESSAGE",
              chatId: chatToTake.id,
              content: systemMsg,
            });

            broadcastToAgents({
              type: "CHAT_TAKEN_OVER",
              chatId: chatToTake.id,
              agentId: data.userId,
              operatorName,
            });

            // Notifica o painel do agente com a mensagem de sistema (para aparecer no histórico em tempo real)
            broadcastToAgents({
              type: "CHAT_MESSAGE",
              chatId: chatToTake.id,
              visitorId: chatToTake.visitorId,
              sender: "system",
              content: systemMsg,
              timestamp: new Date().toISOString(),
            });

            console.log(`[LiveChat] Chat ${chatToTake.id} assumido por "${operatorName}" — AGENT_JOINED enviado ao visitante`);
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
            // MAS apenas se o atendimento NÃO estiver em estágio finalizado.
            // Evita enviar "Opa, você ainda está aí?" para clientes cuja conversa já foi encerrada.
            const activeChat = await lcStorage.getActiveChatByVisitor(visitorId);
            if (activeChat) {
              const CONCLUDED_STAGES = ['pos_venda', 'maquinas', 'pecas', 'outros', 'finalizado_com_venda', 'finalizado_sem_venda', 'sem_resposta', 'vendido'];
              const visitorForCheck = await lcStorage.getVisitorById(visitorId);
              const isConcluded = CONCLUDED_STAGES.includes(visitorForCheck?.pipelineStage ?? '');
              if (!isConcluded) {
                startFollowUpTimers(visitorId, activeChat.id);
              } else {
                console.log(`[LiveChat] Follow-up bloqueado ao desconectar — estágio protegido: ${visitorForCheck?.pipelineStage}`);
              }
            }

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
