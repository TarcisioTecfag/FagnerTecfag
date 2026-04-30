// server/fagner/fagnerOrchestrator.ts
// Orquestrador central do Fagner
// Conecta: webhook → debounce → CNPJ/mídia → Gemini → flowEngine → CRM → transferência

import { v4 as uuidv4 } from "uuid";
import {
  getOrCreateSession,
  ContactSession,
  getAllSessions,
  getActiveSessions,
  addToHistory,
} from "./sessionManager.js";
import { enqueueMessage, cancelDebounce } from "./debounceEngine.js";
import {
  callGemini,
  initChatSession,
  ragSearch,
  splitHumanized,
  MessagePart,
} from "./geminiService.js";
import {
  detectCnpj,
  detectCpf,
  lookupCnpj,
  formatCnpjDataForPrompt,
} from "./cnpjService.js";
import { checkProtests } from "./cenprotService.js";
import { checkCreditEligibility } from "./serasaService.js";
import {
  transcribeAudio,
  analyzeImage,
  formatAudioContext,
  formatImageContext,
  makeAudioRecord,
  makeImageRecord,
} from "./mediaService.js";
import {
  detectCompletion,
  detectFlowFromText,
  setFlow,
  getTransferTarget,
  buildCreditContext,
  buildCnpjContext,
  buildMediaContext,
  flowRequiresCnpj,
  flowRequiresCredit,
  flowGeneratesCard,
} from "./flowEngine.js";
import {
  sendMessage,
  getContactInfo,
  createOrUpdateContact,
  forwardToFlow,
} from "./rdConversasService.js";
import { upsertDeal } from "./rdCrmService.js";
import {
  generateReportJson,
  generateReportText,
  saveReportToDb,
} from "./reportService.js";
import { checkFollowUps, reactivateSession, setForceCloseSession } from "./followUpService.js";
import {
  isWithinSchedule,
  getOffHoursMessage,
  getNextOpenTime,
  getSchedule,
  setSchedule,
} from "./scheduleService.js";
import {
  searchProduct,
  detectMachineIntent,
  formatVtexContextForGemini,
  createVtexCheckout,
  type VtexCheckoutRequest,
} from "./vtexService.js";
import { lcStorage } from "../livechat/livechatStorage.js";

export { getSchedule, setSchedule };

// ─── Regex da tag de checkout ─────────────────────────────────────────────────
const VTEX_CHECKOUT_TAG_REGEX = /\[VTEX_CHECKOUT_REQUEST:({[^\]]+})\]/;

// ─── Tipos do webhook ─────────────────────────────────────────────────────────

export interface WebhookPayload {
  contactId: string;
  message?: string;
  mediaUrl?: string;
  mimeType?: string;
  phone?: string;
  contactName?: string;
}

// ─── Dependências externas injetadas ────────────────────────────────────────
// Agora usa storage (PostgreSQL) em vez de db (SQLite)

interface OrchestratorDeps {
  storage: any;
  getApiKey: () => string | Promise<string>;
  getRagDocuments: () => { id: string; name: string; content: string }[] | Promise<{ id: string; name: string; content: string }[]>;
  emitLog: (msg: string, level?: "INFO" | "WARN" | "ERROR" | "SUCCESS") => void;
}

let deps: OrchestratorDeps;

export function initOrchestrator(d: OrchestratorDeps) {
  deps = d;
  deps.emitLog("Fagner Orchestrator inicializado 🚀", "SUCCESS");
  // Injeta forceCloseSession no followUpService (evita import circular)
  setForceCloseSession(forceCloseSession);
}

// ─── Round-robin de Peças ───────────────────────────────────────────────────────
// Alterna entre "Tecfag Peças" e "Tecfag Peças 2" a cada atendimento do fluxo PECAS.
// O contador é persistido no banco para sobreviver a restarts do servidor.

async function getNextPecasDepartment(): Promise<string> {
  const PECAS_SECTORS = ["Tecfag Peças", "Tecfag Peças 2"];
  try {
    const raw = await deps.storage.getSetting("fagner_pecas_rr_index");
    const current = parseInt(raw ?? "0", 10) || 0;
    const chosen = PECAS_SECTORS[current % PECAS_SECTORS.length];

    // Incrementa para o próximo
    const next = (current + 1) % PECAS_SECTORS.length;
    await deps.storage.setSetting("fagner_pecas_rr_index", String(next));

    deps.emitLog(`[Round-Robin Peças] Setor escolhido: ${chosen} (próximo será: ${PECAS_SECTORS[next]})`, "INFO");
    return chosen;
  } catch {
    return "Tecfag Peças"; // fallback
  }
}

// ─── Mapeia SubFlow → departamento do RD Conversas ───────────────────────────
// O nome precisa ser IDÊNTICO ao cadastrado no painel RD Conversas.
// Pode ser personalizado via settings (fagner_department_map).

async function getDepartmentForSubFlow(subFlow?: string | null): Promise<string> {
  // Round-robin especial para PECAS: alterna entre os dois setores de peças
  if (subFlow === "PECAS") {
    return getNextPecasDepartment();
  }

  // Primeiro tenta buscar mapeamento personalizado salvo no banco
  try {
    const raw = await deps.storage.getSettingParsed("fagner_department_map");
    if (raw && typeof raw === "object") {
      const map = raw as Record<string, string>;
      if (subFlow && map[subFlow]) return map[subFlow];
    }
  } catch { /* sem mapa personalizado, usa padrão */ }

  // Mapeamento padrão — nomes EXATOS dos setores cadastrados no RD Conversas (Tallos) da Tecfag
  const DEFAULT_MAP: Record<string, string> = {
    MAQUINAS:     "Tecfag Maquinas",
    PERSONNALITE: "Tecfag PersonnalIté",
    "2A_BOLETO":  "FINANCEIRO",
    "2B_NF":      "FINANCEIRO",
    "2C_OUTROS":  "FINANCEIRO",
    "3_AT":       "ASSISTÊNCIA TÉCNICA",
    "4A_RASTREAR":"PÓS VENDA",
    "4B_NF":      "PÓS VENDA",
    "5A_CLIENTE": "RECEPÇÃO",
    "5B_CURRICULO":"ADMINISTRADORES",
  };

  return DEFAULT_MAP[subFlow ?? ""] ?? "RECEPÇÃO";
}


// ─── Envio com delay humanizado ───────────────────────────────────────────────

async function sendWithDelay(contactId: string, parts: MessagePart[]): Promise<void> {
  const isSim = contactId.startsWith("sim-");
  for (const part of parts) {
    // Sessões de simulação: sem delay (o interceptador coleta todas as partes)
    if (!isSim && part.delayMs > 0) {
      await new Promise((r) => setTimeout(r, part.delayMs));
    }
    await sendMessage(contactId, part.text);
  }
}

// ─── Loga custo no banco ──────────────────────────────────────────────────────

async function logCost(tokens: number, prompt: number, output: number, note: string) {
  try {
    const costEstimate = (prompt * 0.0000025) + (output * 0.00001);
    await deps.storage.createCost({
      service: "gemini",
      operation: "fagner-chat",
      cost: costEstimate,
      tokens,
      notes: note,
    });
  } catch { /* ignora erros de custo */ }
}

// ─── Pipeline principal de processamento por contato ─────────────────────────

async function processContact(session: ContactSession, combinedMessage: string): Promise<void> {
  if (session.isCompleted) return;
  session.isProcessing = true;

  const apiKey = await deps.getApiKey();
  const { contactId } = session;

  try {
    deps.emitLog(`[${contactId}] Processando: "${combinedMessage.slice(0, 80)}..."`, "INFO");

    // ── 0. Reativa se estava pausada ────────────────────────────────────────
    reactivateSession(session);

    // ── 1. Captura nome/telefone do contato se ainda não tem ──────────────
    if (!session.contactPhone) {
      const info = await getContactInfo(contactId);
      if (info?.phone) session.contactPhone = info.phone;
      if (info?.name && !session.flowData.clientName) {
        session.flowData.clientName = info.name;
      }
    }

    // ── 2. Inicializa chat Gemini na 1ª mensagem ───────────────────────────
    if (!session.chatSession) {
      initChatSession(apiKey, session);
    }

    // ── 3. Detecção de fluxo (heurística rápida — LLM faz isso via prompt) ─
    if (!session.currentFlow) {
      const detected = detectFlowFromText(combinedMessage);
      if (detected) {
        setFlow(session, detected.flow, detected.sub);
      }
    }

    // ── 4. Detecção de CPF/CNPJ na mensagem ───────────────────────────────
    let cnpjContext = buildCnpjContext(session);
    const cpf  = !session.flowData.clientCpf  ? detectCpf(combinedMessage) : null;
    const cnpj = !session.flowData.clientCnpj ? detectCnpj(combinedMessage) : null;

    if (cpf && !session.flowData.clientCpf) {
      session.flowData.clientCpf = cpf;
      deps.emitLog(`[${contactId}] CPF detectado: ${cpf}`, "INFO");
    }

    if (cnpj && !session.validatedCnpjs.has(cnpj)) {
      session.flowData.clientCnpj = cnpj;
      session.validatedCnpjs.add(cnpj);
      deps.emitLog(`[${contactId}] CNPJ detectado: ${cnpj} — consultando Receita Federal...`, "INFO");

      // Hold message enquanto consulta
      await sendMessage(contactId, "Um segundo, deixa eu verificar aqui suas informações... 🔍");

      const cnpjData = await lookupCnpj(cnpj);
      if (cnpjData) {
        session.cnpjApiData = cnpjData;
        session.flowData.companyName = cnpjData.razao_social;
        cnpjContext = buildCnpjContext(session);
        deps.emitLog(`[${contactId}] Receita Federal: ${cnpjData.razao_social}`, "SUCCESS");

        // Análise de crédito para Fluxo 1
        if (flowRequiresCnpj(session) && flowRequiresCredit(session)) {
          deps.emitLog(`[${contactId}] Consultando CENPROT + SERASA...`, "INFO");

          const [cenprotResult, serasaResult] = await Promise.all([
            checkProtests(cnpj),
            checkCreditEligibility(cnpj),
          ]);

          session.flowData.hasProtests    = cenprotResult.hasProtests;
          session.flowData.creditEligible = serasaResult.eligible;
          session.flowData.paymentMode    = serasaResult.eligible ? "normal" : "avista";

          deps.emitLog(
            `[${contactId}] Crédito: protestos=${cenprotResult.hasProtests} elegível=${serasaResult.eligible}`,
            serasaResult.eligible ? "SUCCESS" : "WARN"
          );
        }
      } else {
        deps.emitLog(`[${contactId}] CNPJ não encontrado na Receita Federal.`, "WARN");
      }
    }

    // CNPJ já validado anteriormente?
    if (
      !cnpj && !cpf &&
      session.flowData.clientCnpj &&
      session.validatedCnpjs.has(session.flowData.clientCnpj) &&
      combinedMessage.replace(/\D/g, "").length === 14
    ) {
      // cliente re-enviou o mesmo CNPJ → já temos, não re-consulta
    }

    // ── 5. RAG — busca semântica ─────────────────────────────────────────
    let ragContext = "";
    if (apiKey) {
      const docs = await deps.getRagDocuments();
      if (docs.length > 0) {
        ragContext = await ragSearch(combinedMessage, docs, apiKey, 3);
      }
    }

    // ── 5.5 VTEX — busca de produto no catálogo tecfag.com.br ────────────
    let vtexContext = "";
    // Só busca se a sessão for do fluxo de Máquinas ou ainda sem fluxo definido
    const isMachinesFlow = !session.currentFlow || session.currentFlow === 1 || String(session.currentSubFlow ?? "").includes("MAQUINAS");
    if (isMachinesFlow) {
      const machineQuery = detectMachineIntent(combinedMessage);
      if (machineQuery) {
        deps.emitLog(`[${contactId}] 🔍 VTEX: detectou intenção de máquina — buscando "${machineQuery}"...`, "INFO");
        try {
          const vtexResult = await searchProduct(machineQuery);
          vtexContext = formatVtexContextForGemini(vtexResult);

          // Registra no log de ações do painel VTEX
          const logType   = vtexResult.found ? "found"     : "not_found";
          const logDesc   = vtexResult.found
            ? `Encontrou "${vtexResult.productName}" — ${vtexResult.available ? "disponível" : "indisponível"}`
            : `Produto não encontrado: "${(vtexResult as any).normalizedQuery}"` ;

          try {
            await deps.storage.createVtexLog({ type: "search", description: `Buscou "${machineQuery}"`, product: machineQuery });
            await deps.storage.createVtexLog({ type: logType, description: logDesc, product: vtexResult.found ? vtexResult.productName : machineQuery });

            if (vtexResult.found && vtexResult.available) {
              await deps.storage.createVtexLog({ type: "link_sent", description: `Link enviado automaticamente: ${vtexResult.link}`, product: vtexResult.productName });
            }

            // Registra falha se não encontrou
            if (!vtexResult.found) {
              await deps.storage.createVtexFailure({ query: machineQuery, reason: "Não encontrado" });
            }
          } catch (dbErr) {
            // Ignora erros de log — não deve travar o atendimento
          }

          deps.emitLog(
            `[${contactId}] VTEX: ${vtexResult.found ? `✅ ${vtexResult.productName}` : "❌ não encontrado"}`,
            vtexResult.found ? "SUCCESS" : "WARN"
          );
        } catch (vtexErr: any) {
          deps.emitLog(`[${contactId}] VTEX: erro na busca (ignorando) — ${vtexErr.message}`, "WARN");
        }
      }
    }

    // ── 6. Construção do extra context ────────────────────────────────────
    const extraParts: string[] = [];
    if (cnpjContext) extraParts.push(cnpjContext);
    const creditCtx = buildCreditContext(session);
    if (creditCtx) extraParts.push(creditCtx);
    const mediaCtx = buildMediaContext(session);
    if (mediaCtx) extraParts.push(mediaCtx);
    if (vtexContext) extraParts.push(vtexContext);
    const extraContext = extraParts.join("\n\n") || undefined;

    // ── 7. Chama Gemini ──────────────────────────────────────────────────
    let response: string;
    try {
      response = await callGemini({
        session,
        userMessage: combinedMessage,
        apiKey,
        ragContext: ragContext || undefined,
        extraContext,
        logCost: (tokens, prompt, output) =>
          logCost(tokens, prompt, output, `msg:${combinedMessage.slice(0, 50)}`),
      });
    } catch (geminiErr: any) {
      deps.emitLog(`[${contactId}] Erro do Gemini: ${geminiErr.message}`, "ERROR");
      // Reseta chatSession para permitir retry na próxima mensagem
      session.chatSession = null;
      const fallbackMsg = "Desculpe, tive um probleminha técnico aqui 😅 Pode repetir sua mensagem, por favor?";
      await sendWithDelay(contactId, [{ text: fallbackMsg, delayMs: 0 }]);
      return;
    }

    deps.emitLog(`[${contactId}] Resposta Gemini: "${response.slice(0, 80)}..."`, "INFO");

    // ── 8. Detecta fluxo na resposta (LLM pode ter identificado) ─────────
    if (!session.currentFlow) {
      const detected = detectFlowFromText(response);
      if (detected) setFlow(session, detected.flow, detected.sub);
    }

    // ── 9. Processa tag de checkout VTEX ────────────────────────────────
    let processedResponse = response;
    const checkoutTagMatch = response.match(VTEX_CHECKOUT_TAG_REGEX);
    if (checkoutTagMatch) {
      deps.emitLog(`[${contactId}] 🛒 VTEX_CHECKOUT_REQUEST detectado — criando carrinho real...`, "INFO");
      try {
        const checkoutData = JSON.parse(checkoutTagMatch[1]) as Record<string, any>;

        // Mescla com dados da sessão como fallback
        const req: VtexCheckoutRequest = {
          skuId:      String(checkoutData.skuId ?? session.productNotes[0] ?? ""),
          quantity:   Number(checkoutData.qty ?? 1),
          clientName: String(checkoutData.name ?? session.flowData.clientName ?? "Cliente"),
          email:      String(checkoutData.email ?? ""),
          cpf:        checkoutData.cpf  ? String(checkoutData.cpf)  : session.flowData.clientCpf,
          cnpj:       checkoutData.cnpj ? String(checkoutData.cnpj) : session.flowData.clientCnpj,
          phone:      String(checkoutData.phone ?? session.contactPhone ?? ""),
          cep:        String(checkoutData.cep ?? ""),
          street:     String(checkoutData.street ?? ""),
          number:     String(checkoutData.number ?? "s/n"),
          complement: checkoutData.complement ? String(checkoutData.complement) : undefined,
          city:       checkoutData.city  ? String(checkoutData.city)  : undefined,
          state:      checkoutData.state ? String(checkoutData.state) : undefined,
        };

        const result = await createVtexCheckout(req);

        if (result.success && result.checkoutUrl) {
          deps.emitLog(`[${contactId}] ✅ Checkout criado: ${result.checkoutUrl}`, "SUCCESS");
          // Remove a tag e injeta o link real
          processedResponse = processedResponse
            .replace(VTEX_CHECKOUT_TAG_REGEX, result.checkoutUrl)
            // Strip markdown WhatsApp da mensagem de checkout
            .replace(/\*([^*]+)\*/g, "$1")   // *negrito* → texto
            .replace(/_([^_]+)_/g, "$1");     // _itálico_ → texto

          // ★ ATUALIZA PURCHASE INTENT SCORE = 100 no visitante do LiveChat
          // (fire-and-forget — não bloqueia envio da mensagem)
          (async () => {
            try {
              const phone = req.phone || session.contactPhone || "";
              const visitor = phone ? await lcStorage.getVisitorByPhone(phone) : null;
              if (visitor) {
                await lcStorage.updatePurchaseIntentScore(visitor.id, 100);
                await lcStorage.updateVisitorPipeline(visitor.id, "finalizado_com_venda");
                deps.emitLog(`[${contactId}] 📊 LiveChat: purchaseIntentScore=100 + pipeline=finalizado_com_venda para visitor ${visitor.id}`, "SUCCESS");
              } else {
                deps.emitLog(`[${contactId}] ⚠️ LiveChat: visitante não encontrado pelo telefone "${phone}" — score não atualizado`, "WARN");
              }
            } catch (scoreErr: any) {
              deps.emitLog(`[${contactId}] ⚠️ Erro ao atualizar purchaseIntentScore: ${scoreErr.message}`, "WARN");
            }
          })();
        } else {
          deps.emitLog(`[${contactId}] ❌ Falha ao criar checkout: ${result.error}`, "ERROR");
          // Remove a tag e avisa o cliente
          processedResponse = processedResponse.replace(
            VTEX_CHECKOUT_TAG_REGEX,
            "[aguarde, estou gerando o link...]"
          );
          // Envia mensagem de erro amigável após
          await sendMessage(contactId, "Tive um probleminha técnico ao gerar o link de pagamento. Já notifiquei nossa equipe e vou te passar o link em instantes. 🙏");
        }
      } catch (checkoutErr: any) {
        deps.emitLog(`[${contactId}] ❌ Erro ao parsear VTEX_CHECKOUT_REQUEST: ${checkoutErr.message}`, "ERROR");
        processedResponse = processedResponse.replace(VTEX_CHECKOUT_TAG_REGEX, "");
      }
    } else {
      // Mesmo sem checkout, remove formatação markdown da resposta (asteriscos/underscores)
      processedResponse = processedResponse
        .replace(/\*\*([^*]+)\*\*/g, "$1")  // **negrito** → texto
        .replace(/\*([^*]+)\*/g, "$1")      // *negrito* → texto
        .replace(/_([^_]+)_/g, "$1");        // _itálico_ → texto
    }

    // ── 9b. Strip de tag interna VTEX_CHECKOUT_REQUEST remanescente ─────
    processedResponse = processedResponse
      .replace(/\[VTEX_CHECKOUT_REQUEST[^\]]*\]/gi, "")
      .trim();

    // ── 9c. Split humanizado e envio ─────────────────────────────────────
    const parts = splitHumanized(processedResponse);
    await sendWithDelay(contactId, parts);

    // ── 10. Detecta finalização ──────────────────────────────────────────
    if (detectCompletion(response)) {
      session.isCompleted = true;
      cancelDebounce(session);

      deps.emitLog(`[${contactId}] Atendimento finalizado — gerando relatório...`, "INFO");

      // Relatório
      const reportJson = await generateReportJson(session, apiKey);
      const reportText = generateReportText(session, reportJson, session.cnpjApiData as any);

      // Upsert no CRM
      if (flowGeneratesCard(session)) {
        await upsertDeal(session, session.cnpjApiData as any);
      }

      // ── Determina setor de destino baseado no subfluxo detectado ────────────
      const operator = getTransferTarget(session);
      await saveReportToDb(deps.storage, session, reportText, reportJson, operator.name);

      // ── Atualiza contato no RD Conversas com department_name correto ─────────
      // Isso coloca o contato na fila do setor certo dentro do RD Conversas.
      const departmentName = await getDepartmentForSubFlow(session.currentSubFlow);
      if (session.contactPhone) {
        await createOrUpdateContact({
          cel_phone: session.contactPhone,
          full_name: session.flowData.clientName ?? "Cliente",
          integration: process.env.RD_CONVERSAS_INTEGRATION ?? "",
          department_name: departmentName,
          tags: [session.currentSubFlow ?? "geral", "fagner-triagem"].filter(Boolean) as string[],
          ...(session.flowData.clientCnpj ? { cnpj: session.flowData.clientCnpj } : {}),
          ...(session.flowData.clientCpf ? { cpf: session.flowData.clientCpf } : {}),
        }).catch((e: any) =>
          deps.emitLog(`[${contactId}] Aviso: falha ao atualizar contato RD — ${e.message}`, "WARN")
        );
      }

      // ── Encaminha para fluxo de atendimento humano no RD Conversas ────────────
      // O flowId é configurado no painel (fagner_rd_human_flow_id).
      const humanFlowId = await deps.storage.getSettingParsed("fagner_rd_human_flow_id") ?? "";

      if (humanFlowId && !contactId.startsWith("sim-")) {
        await forwardToFlow(contactId, humanFlowId).catch((e: any) =>
          deps.emitLog(`[${contactId}] Aviso: falha ao encaminhar fluxo RD — ${e.message}`, "WARN")
        );
      }

      deps.emitLog(`[${contactId}] ✅ Transferido para ${operator.name} | Dept: ${departmentName}. Fluxo: ${session.currentSubFlow}`, "SUCCESS");
    }

  } finally {
    session.isProcessing = false;

    // ── INTERRUPT & REPLAY: consome mensagens que chegaram durante o processamento ──
    // Usa enqueueMessage (caminho normal) para garantir que o histórico do Gemini
    // já está atualizado antes do replay — evita re-greeting e contexto quebrado.
    if (!session.isCompleted && session.pendingWhileProcessing.length > 0) {
      const pending = session.pendingWhileProcessing.splice(0).join("\n").trim();
      deps.emitLog(`[${session.contactId}] 🔄 Replay: re-enfileirando mensagem pendente após processamento.`, "INFO");
      // Pequena pausa para garantir que o histórico foi persistido antes do replay
      setTimeout(() => {
        enqueueMessage(session, pending, processContact);
      }, 800);
    }
  }
}

// ─── Auto-close: assume confirmação e fecha o atendimento ────────────────────
// Chamada pelo followUpService após 5 minutos sem resposta do cliente.
// Envia mensagem de encerramento natural, cria o card e fecha a sessão.

export async function forceCloseSession(session: ContactSession, reason: string): Promise<void> {
  if (session.isCompleted || session.isProcessing) return;

  deps.emitLog(`[${session.contactId}] ⏱️ Auto-close: ${reason}`, "WARN");

  session.isCompleted = true;
  cancelDebounce(session);

  try {
    const apiKey = await deps.getApiKey();
    const isSim = session.contactId.startsWith("sim-");

    // ── 1. Envia mensagens de encerramento ao cliente ─────────────────────────
    // Fagner assume confirmação e encerra de forma natural, sem deixar o cliente sem resposta.
    if (!isSim) {
      const closingMessages = [
        "Acredito que esteja certo! 😊",
        "Já registrei todas as suas informações.",
        "Em breve nossa equipe entrará em contato. Obrigado pelo contato com a Tecfag! 😊",
      ];
      for (const msg of closingMessages) {
        await sendMessage(session.contactId, msg).catch(() => {});
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    // ── 2. Garante que o fluxo está definido para criação do card ─────────────
    // Se o fluxo não foi detectado, usa MAQUINAS como padrão —
    // clientes que chegaram até o ponto de dar telefone são leads comerciais.
    if (!session.currentFlow) {
      setFlow(session, 1, "MAQUINAS");
      deps.emitLog(`[${session.contactId}] ⚠️ Fluxo não detectado — usando MAQUINAS como fallback para criar card.`, "WARN");
    }

    // ── 3. Adiciona nota de auto-close ao flowData ────────────────────────────
    const closeNote = `[AUTO-CLOSE] ${reason}. Fagner assumiu confirmação após 5min sem resposta.`;
    session.flowData.notes = session.flowData.notes
      ? `${session.flowData.notes}\n${closeNote}`
      : closeNote;

    // ── 4. Gera relatório e cria o card no CRM ────────────────────────────────
    const reportJson = await generateReportJson(session, apiKey).catch(() => ({}));
    const reportText = generateReportText(session, reportJson, session.cnpjApiData as any);

    if (flowGeneratesCard(session)) {
      await upsertDeal(session, session.cnpjApiData as any).catch((e: any) =>
        deps.emitLog(`[${session.contactId}] Aviso: falha ao criar card (auto-close) — ${e.message}`, "WARN")
      );
    }

    const operator = getTransferTarget(session);
    await saveReportToDb(deps.storage, session, reportText, reportJson, operator.name).catch((e: any) =>
      deps.emitLog(`[${session.contactId}] Aviso: falha ao salvar relatório (auto-close) — ${e.message}`, "WARN")
    );

    deps.emitLog(`[${session.contactId}] ✅ Auto-close concluído. Card criado. Operador: ${operator.name}`, "SUCCESS");
  } catch (err: any) {
    deps.emitLog(`[${session.contactId}] Erro em forceCloseSession: ${err.message}`, "ERROR");
  }
}



export async function processMedia(
  session: ContactSession,
  mediaUrl: string,
  mimeType: string
): Promise<void> {
  const apiKey = await deps.getApiKey();
  const isAudio = mimeType.includes("audio");

  deps.emitLog(`[${session.contactId}] Processando mídia: ${mimeType}`, "INFO");

  if (isAudio) {
    const analysis = await transcribeAudio(mediaUrl, apiKey);
    session.mediaMemory.push(makeAudioRecord(mediaUrl, analysis));

    if (analysis.detectedCnpj && !session.flowData.clientCnpj) {
      session.flowData.clientCnpj = analysis.detectedCnpj;
    }
    if (analysis.detectedProduct) {
      session.productNotes.push(analysis.detectedProduct);
    }

    // Injeta transcrição como mensagem
    const transcriptMsg = formatAudioContext(analysis);
    enqueueMessage(session, transcriptMsg, processContact);
  } else {
    const analysis = await analyzeImage(mediaUrl, apiKey);
    session.mediaMemory.push(makeImageRecord(mediaUrl, analysis));

    if (analysis.detectedCnpj && !session.flowData.clientCnpj) {
      session.flowData.clientCnpj = analysis.detectedCnpj;
    }
    if (analysis.detectedProduct) {
      session.productNotes.push(analysis.detectedProduct);
    }

    // Injeta análise da imagem como contexto
    const imageMsg = formatImageContext(analysis);
    enqueueMessage(session, imageMsg, processContact);
  }
}

// ─── Entry point do webhook ────────────────────────────────────────────────

export async function handleWebhook(payload: WebhookPayload): Promise<void> {
  const { contactId, message, mediaUrl, mimeType, phone, contactName } = payload;

  if (!contactId) {
    deps.emitLog("Webhook recebido sem contactId — ignorado.", "WARN");
    return;
  }

  const session = getOrCreateSession(contactId);

  // ── Verifica horário de atendimento ─────────────────────────────────────
  const isFirstMessage = session.messageCount === 0;
  if (isFirstMessage && !isWithinSchedule()) {
    const msg = getOffHoursMessage();
    const nextOpen = getNextOpenTime();
    deps.emitLog(`[${contactId}] Fora do horário de atendimento — respondendo automaticamente.`, "WARN");
    await sendMessage(contactId, `${msg}\n\nRetornamos ${nextOpen}. 🕐`);
    // Registra a mensagem mas não processa com IA
    session.messageCount++;
    return;
  }

  // Captura dados básicos do contato
  if (phone && !session.contactPhone) session.contactPhone = phone;
  if (contactName && !session.flowData.clientName) session.flowData.clientName = contactName;

  // Mídia
  if (mediaUrl && mimeType) {
    await processMedia(session, mediaUrl, mimeType);
    return;
  }

  // Mensagem de texto
  if (message && message.trim()) {
    // ── Simulação (painel "Ao Vivo"): bypassa o debounce para resposta imediata ──
    if (contactId.startsWith("sim-")) {
      addToHistory(session, message.trim());
      await processContact(session, message.trim());
      return;
    }
    enqueueMessage(session, message.trim(), processContact);
  }
}


// ─── Follow-up loop (roda a cada 60s) ─────────────────────────────────────

export function startFollowUpLoop(): void {
  setInterval(async () => {
    const active = getActiveSessions();
    if (active.length > 0) {
      await checkFollowUps(active).catch((e) =>
        deps?.emitLog(`[FollowUp] Erro: ${e.message}`, "WARN")
      );
    }
  }, 60_000);

  deps?.emitLog("Follow-up loop iniciado (intervalo: 60s)", "INFO");
}

// ─── Expose sessions para dashboard ──────────────────────────────────────

export function getAllSessionsForDashboard() {
  return getAllSessions();
}
