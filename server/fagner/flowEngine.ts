// server/fagner/flowEngine.ts
// Máquina de estados dos 5 fluxos do Fagner
// Detecta fluxo, avança etapas, detecta finalização e orquestra transferências

import { ContactSession, FlowType, SubFlowType } from "./sessionManager.js";
import { getNextOperator } from "./rdCrmService.js";

// ─── Marcador de finalização ──────────────────────────────────────────────────

export const COMPLETION_MARKERS = [
  "vou te conectar com",
  "obrigado por entrar em contato com a tecfag",
  "já registrei todas as informações",
  "pode enviar seu currículo diretamente para dho@tecfag.com.br",
];

export function detectCompletion(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPLETION_MARKERS.some((m) => lower.includes(m));
}

// ─── Detecção de fluxo baseada em keywords ────────────────────────────────────

const FLOW_KEYWORDS: Record<string, { flow: FlowType; sub: SubFlowType }> = {
  // Fluxo 1 — Peças / Máquinas / Personnalite
  peça: { flow: 1, sub: "PECAS" },
  peças: { flow: 1, sub: "PECAS" },
  "peça de reposição": { flow: 1, sub: "PECAS" },
  consumível: { flow: 1, sub: "PECAS" },
  máquina: { flow: 1, sub: "MAQUINAS" },
  equipamento: { flow: 1, sub: "MAQUINAS" },
  orçamento: { flow: 1, sub: "PECAS" },
  cotar: { flow: 1, sub: "PECAS" },
  comprar: { flow: 1, sub: "PECAS" },
  personnalite: { flow: 1, sub: "PERSONNALITE" },
  "linha personnalite": { flow: 1, sub: "PERSONNALITE" },
  // Fluxo 2 — Financeiro
  boleto: { flow: 2, sub: "2A_BOLETO" },
  "segunda via": { flow: 2, sub: "2A_BOLETO" },
  "nota fiscal": { flow: 2, sub: "2B_NF" },
  "nf ": { flow: 2, sub: "2B_NF" },
  pagamento: { flow: 2, sub: "2C_OUTROS" },
  cobrança: { flow: 2, sub: "2A_BOLETO" },
  inadimplência: { flow: 2, sub: "2C_OUTROS" },
  financeiro: { flow: 2, sub: "2C_OUTROS" },
  // Fluxo 3 — Assistência Técnica
  "máquina parada": { flow: 3, sub: "3_AT" },
  defeito: { flow: 3, sub: "3_AT" },
  "não funciona": { flow: 3, sub: "3_AT" },
  manutenção: { flow: 3, sub: "3_AT" },
  assistência: { flow: 3, sub: "3_AT" },
  "assistência técnica": { flow: 3, sub: "3_AT" },
  problema: { flow: 3, sub: "3_AT" },
  erro: { flow: 3, sub: "3_AT" },
  // Fluxo 4 — Pós Venda
  rastrear: { flow: 4, sub: "4A_RASTREAR" },
  rastreio: { flow: 4, sub: "4A_RASTREAR" },
  entrega: { flow: 4, sub: "4A_RASTREAR" },
  pedido: { flow: 4, sub: "4A_RASTREAR" },
  "meu pedido": { flow: 4, sub: "4A_RASTREAR" },
  "nota do pedido": { flow: 4, sub: "4B_NF" },
  // Fluxo 5 — Outros
  currículo: { flow: 5, sub: "5B_CURRICULO" },
  curriculo: { flow: 5, sub: "5B_CURRICULO" },
  curriculum: { flow: 5, sub: "5B_CURRICULO" },
  "falar com": { flow: 5, sub: "5A_CLIENTE" },
  "preciso falar": { flow: 5, sub: "5A_CLIENTE" },
  "já sou cliente": { flow: 5, sub: "5A_CLIENTE" },
};

/**
 * Tenta detectar o fluxo baseado em keywords.
 * Em produção, o Gemini LLM classifica internamente via system prompt.
 * Este método serve como fallback/heurística.
 */
export function detectFlowFromText(text: string): { flow: FlowType; sub: SubFlowType } | null {
  const lower = text.toLowerCase();
  for (const [kw, mapping] of Object.entries(FLOW_KEYWORDS)) {
    if (lower.includes(kw)) return mapping;
  }
  return null;
}

// ─── Atualiza fluxo da sessão ─────────────────────────────────────────────────

export function setFlow(session: ContactSession, flow: FlowType, sub: SubFlowType) {
  if (session.currentFlow !== flow || session.currentSubFlow !== sub) {
    session.currentFlow = flow;
    session.currentSubFlow = sub;
    session.flowStep = 0;
    console.log(`[FlowEngine] Sessão ${session.contactId}: Fluxo → ${flow}/${sub}`);
  }
}

export function advanceStep(session: ContactSession) {
  session.flowStep++;
}

// ─── Determina operador de destino para transferência ────────────────────────

export function getTransferTarget(session: ContactSession): { name: string; id: string } {
  const sub = session.currentSubFlow ?? "5A_CLIENTE";
  const operator = session.assignedOperator
    ? { name: session.assignedOperator, id: "" }
    : getNextOperator(sub);
  if (!session.assignedOperator) {
    session.assignedOperator = operator.name;
  }
  return operator;
}

// ─── Contexto de crédito para injeção no prompt (Fluxo 1) ────────────────────

export function buildCreditContext(session: ContactSession): string {
  const fd = session.flowData;
  if (fd.creditEligible === undefined) return "";

  if (!fd.creditEligible || fd.paymentMode === "avista") {
    return `
[ANÁLISE DE CRÉDITO]
A análise de crédito indica que este cliente NÃO está elegível para parcelamento neste momento.
Informe de forma natural e sem constrangimento que as condições de pagamento disponíveis são apenas à vista ou cartão de crédito.
Não mencione SERASA, CENPROT ou análise de crédito diretamente — apenas diga que as condições são essas por enquanto.
`.trim();
  }

  return `[ANÁLISE DE CRÉDITO] Cliente elegível para parcelamento conforme política comercial da Tecfag.`;
}

// ─── Contexto CNPJ para injeção no prompt ────────────────────────────────────

export function buildCnpjContext(session: ContactSession): string {
  const cnpj = session.cnpjApiData;
  if (!cnpj) return "";

  return `
[DADOS DA EMPRESA — RECEITA FEDERAL]
Razão Social: ${cnpj.razao_social}
${cnpj.nome_fantasia ? `Nome Fantasia: ${cnpj.nome_fantasia}` : ""}
${cnpj.situacao ? `Situação: ${cnpj.situacao}` : ""}
${cnpj.porte ? `Porte: ${cnpj.porte}` : ""}
${cnpj.municipio ? `Localização: ${cnpj.municipio}/${cnpj.uf}` : ""}
${cnpj.cnae_principal ? `Atividade: ${cnpj.cnae_principal.descricao}` : ""}

Use esses dados para personalizar a conversa (ex: chame a empresa pelo nome fantasia se disponível, faça perguntas relevantes ao porte/setor). Não cite que consultou a Receita Federal — naturalize as informações.
`.trim();
}

// ─── Contexto de mídia para injeção no prompt ────────────────────────────────

export function buildMediaContext(session: ContactSession): string {
  if (session.mediaMemory.length === 0) return "";
  return session.mediaMemory
    .map((m) => {
      if (m.type === "audio") return `[ÁUDIO RECEBIDO]\nTranscrição: ${m.transcription}\n${m.analysis ?? ""}`;
      return `[IMAGEM RECEBIDA]\n${m.analysis ?? ""}${m.detectedProduct ? `\nProduto/código: ${m.detectedProduct}` : ""}`;
    })
    .join("\n\n");
}

// ─── Verifica se o fluxo precisa de CNPJ ────────────────────────────────────

export function flowRequiresCnpj(session: ContactSession): boolean {
  return session.currentFlow === 1; // Apenas Fluxo 1 (Peças/Máquinas)
}

// ─── Verifica se o fluxo precisa de análise de crédito ───────────────────────

export function flowRequiresCredit(session: ContactSession): boolean {
  return session.currentFlow === 1 && !!session.flowData.clientCnpj && !session.flowData.creditEligible;
}

// ─── Verifica se o atendimento deve gerar card no CRM ────────────────────────

export function flowGeneratesCard(session: ContactSession): boolean {
  return session.currentSubFlow !== "2C_OUTROS" && session.currentSubFlow !== "5B_CURRICULO";
}
