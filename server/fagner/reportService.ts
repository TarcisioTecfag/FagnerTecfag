// server/fagner/reportService.ts
// Geração de relatório de triagem via Gemini one-shot e registro no banco de dados

import { v4 as uuidv4 } from "uuid";
import { ContactSession } from "./sessionManager.js";
import { CnpjData, formatCnpjDataForPrompt } from "./cnpjService.js";
import { extractReportJson } from "./geminiService.js";
import { buildReportPrompt } from "./systemPrompt.js";

// ─── Geração do JSON extraído ─────────────────────────────────────────────────

export async function generateReportJson(
  session: ContactSession,
  apiKey: string
): Promise<Record<string, any>> {
  const conversationText = session.chatSession?.history
    ?.map((h: any) => `${h.role === "user" ? "CLIENTE" : "FAGNER"}: ${h.parts?.[0]?.text ?? ""}`)
    .join("\n") ?? "(sem histórico)";

  const sessionData = {
    contactId: session.contactId,
    fluxo: session.currentFlow,
    subfluxo: session.currentSubFlow,
    flowData: session.flowData,
    productNotes: session.productNotes,
    moodAtendimento: session.sessionMood,
  };

  const prompt = buildReportPrompt(conversationText, sessionData);
  return await extractReportJson(prompt, apiKey);
}

// ─── Relatório em texto estruturado ──────────────────────────────────────────

export function generateReportText(
  session: ContactSession,
  reportJson: Record<string, any>,
  cnpjData?: CnpjData | null
): string {
  const fd = session.flowData;
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════╗");
  lines.push("║       RELATÓRIO DE TRIAGEM — FAGNER  ║");
  lines.push("╚══════════════════════════════════════╝");
  lines.push("");

  // Identificação
  lines.push("── IDENTIFICAÇÃO DO CLIENTE ──");
  lines.push(`Nome: ${reportJson.nome_completo ?? fd.clientName ?? "N/I"}`);
  lines.push(`Telefone: ${reportJson.telefone ?? fd.clientPhone ?? session.contactPhone ?? "N/I"}`);
  if (reportJson.cnpj ?? fd.clientCnpj) lines.push(`CNPJ: ${reportJson.cnpj ?? fd.clientCnpj}`);
  if (reportJson.cpf ?? fd.clientCpf) lines.push(`CPF: ${reportJson.cpf ?? fd.clientCpf}`);
  lines.push(`Empresa: ${reportJson.nome_empresa ?? fd.companyName ?? "N/I"}`);
  lines.push("");

  // Fluxo e interesse
  lines.push("── INTERESSE COMERCIAL ──");
  lines.push(`Fluxo: ${session.currentFlow ?? "N/I"} — ${session.currentSubFlow ?? "N/I"}`);
  lines.push(`Produto/Serviço: ${reportJson.produto_interesse ?? fd.productType ?? "N/I"}`);
  lines.push(`Volume: ${reportJson.volume_producao ?? fd.productVolume ?? "N/I"}`);
  lines.push(`Nível de interesse: ${reportJson.nivel_interesse ?? fd.interestLevel ?? "N/I"}`);
  lines.push(`Cliente novo: ${fd.isNewClient !== undefined ? (fd.isNewClient ? "Sim" : "Não") : "N/I"}`);
  lines.push("");

  // Crédito (Fluxo 1)
  if (fd.creditEligible !== undefined) {
    lines.push("── ANÁLISE DE CRÉDITO ──");
    lines.push(`Protestos (CENPROT): ${fd.hasProtests ? "SIM — verificar" : "Não encontrados"}`);
    lines.push(`Elegível para parcelamento: ${fd.creditEligible ? "Sim" : "NÃO"}`);
    lines.push(`Modalidade de pagamento: ${fd.paymentMode === "avista" ? "À vista / Cartão" : "Normal"}`);
    lines.push("");
  }

  // Assistência Técnica (Fluxo 3)
  if (session.currentFlow === 3) {
    lines.push("── ASSISTÊNCIA TÉCNICA ──");
    lines.push(`Problema: ${reportJson.descricao_problema ?? fd.problemDescription ?? "N/I"}`);
    lines.push(`Tipo de suporte: ${fd.supportType ?? "N/I"}`);
    lines.push("");
  }

  // Pós-Venda (Fluxo 4)
  if (session.currentFlow === 4) {
    lines.push("── PÓS VENDA ──");
    lines.push(`Nº do pedido: ${reportJson.numero_pedido ?? fd.orderNumber ?? "N/I"}`);
    lines.push("");
  }

  // Dados Receita Federal
  if (cnpjData) {
    lines.push("── PERFIL DA EMPRESA (RECEITA FEDERAL) ──");
    lines.push(formatCnpjDataForPrompt(cnpjData));
    lines.push("");
  }

  // Mídia
  if (session.mediaMemory.length > 0) {
    lines.push("── MÍDIAS RECEBIDAS ──");
    session.mediaMemory.forEach((m, i) => {
      lines.push(`${i + 1}. [${m.type.toUpperCase()}] ${m.analysis ?? m.transcription ?? "N/I"}`);
      if (m.detectedProduct) lines.push(`   Produto detectado: ${m.detectedProduct}`);
    });
    lines.push("");
  }

  // Produtos
  if (session.productNotes.length > 0) {
    lines.push("── PRODUTOS / CÓDIGOS MENCIONADOS ──");
    lines.push(session.productNotes.join(", "));
    lines.push("");
  }

  // Observações e próximos passos
  lines.push("── OBSERVAÇÕES ──");
  lines.push(reportJson.observacoes ?? fd.notes ?? "Nenhuma.");
  lines.push("");
  lines.push("── PRÓXIMOS PASSOS ──");
  lines.push(reportJson.proximos_passos ?? "Encaminhado para o atendente responsável.");
  lines.push("");

  lines.push(`Atendimento: ${session.sessionMood} | ${new Date().toLocaleString("pt-BR")}`);

  return lines.join("\n");
}

// ─── Salva relatório no banco de dados ───────────────────────────────────────

export async function saveReportToDb(
  storage: any,
  session: ContactSession,
  reportText: string,
  reportJson: Record<string, any>,
  assignedOperator: string
): Promise<void> {
  const sessionId = session.sessionDbId;

  // Tenta criar/atualizar sessão no banco via storage (PostgreSQL)
  try {
    await storage.upsertSession({
      id: sessionId,
      startTime: session.createdAt.toISOString(),
      status: "COMPLETED",
      clientName: reportJson.nome_completo ?? session.flowData.clientName ?? null,
      clientPhone: session.contactPhone ?? session.flowData.clientPhone ?? null,
      contactId: session.contactId,
    });

    // Log
    await storage.createLog({
      sessionId,
      level: "INFO",
      message: `Triagem finalizada. Operador: ${assignedOperator}. Fluxo: ${session.currentSubFlow}`,
    });
  } catch (err) {
    console.error("[Report] Erro ao salvar no banco:", err);
  }
}
