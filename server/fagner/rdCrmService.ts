// server/fagner/rdCrmService.ts
// Integração com RD Station CRM
// Criar/atualizar deals, round-robin de responsáveis, funis mapeados

import { ContactSession } from "./sessionManager.js";
import { CnpjData } from "./cnpjService.js";

const RD_CRM_API   = "https://api.rd.services/platform";
const RD_CRM_TOKEN = process.env.RD_CRM_TOKEN ?? "";

// ─── Funis mapeados ───────────────────────────────────────────────────────────

export const FUNNELS: Record<string, string> = {
  // Subfluxo → Nome do funil no RD CRM
  PECAS:          "Peças",
  MAQUINAS:       "Máquinas",
  PERSONNALITE:   "Personnalite",
  "2A_BOLETO":    "Financeiro",
  "2B_NF":        "Financeiro",
  "3_AT":         "Assistência Técnica",
  "4A_RASTREAR":  "Pós Venda",
  "4B_NF":        "Pós Venda",
};

// ─── Operadores por fluxo (configuráveis via settings) ───────────────────────

export const DEFAULT_OPERATORS: Record<string, { name: string; id: string }[]> = {
  PECAS:          [{ name: "Comercial Peças", id: "op-pecas" }],
  MAQUINAS:       [{ name: "Comercial Máquinas", id: "op-maquinas" }],
  PERSONNALITE:   [{ name: "Comercial Personnalite", id: "op-personnalite" }],
  "2A_BOLETO":    [{ name: "Jeisa", id: "op-jeisa" }],
  "2B_NF":        [{ name: "Jeisa", id: "op-jeisa" }],
  "2C_OUTROS":    [{ name: "Samara", id: "op-samara" }],
  "3_AT":         [{ name: "Técnico Responsável", id: "op-tecnico" }],
  "4A_RASTREAR":  [{ name: "Pós Venda", id: "op-posvenda" }],
  "4B_NF":        [{ name: "Pós Venda", id: "op-posvenda" }],
  "5A_CLIENTE":   [{ name: "Atendimento Geral", id: "op-atendimento" }],
};

// Round-robin index por subFluxo
const rrIndex: Record<string, number> = {};

export function getNextOperator(subFlow: string): { name: string; id: string } {
  const list = DEFAULT_OPERATORS[subFlow] ?? DEFAULT_OPERATORS["5A_CLIENTE"];
  if (!list || list.length === 0) return { name: "Atendimento", id: "op-default" };
  const idx = (rrIndex[subFlow] ?? 0) % list.length;
  rrIndex[subFlow] = idx + 1;
  return list[idx];
}

// ─── Helper de request ────────────────────────────────────────────────────────

async function crmRequest(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: object
): Promise<{ ok: boolean; data: any }> {
  if (!RD_CRM_TOKEN) {
    console.log(`[RD CRM] MOCK — ${method} ${path}`, body ? JSON.stringify(body).slice(0, 120) : "");
    return { ok: true, data: { id: `mock-deal-${Date.now()}`, mock: true } };
  }

  try {
    const res = await fetch(`${RD_CRM_API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RD_CRM_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err: any) {
    console.error(`[RD CRM] Erro ${method} ${path}:`, err.message);
    return { ok: false, data: { error: err.message } };
  }
}

// ─── Busca deal existente (por telefone ou CNPJ) ──────────────────────────────

export async function findExistingDeal(
  phone?: string,
  cnpj?: string
): Promise<string | null> {
  if (!RD_CRM_TOKEN) {
    console.log(`[RD CRM] MOCK — Buscando deal existente para phone=${phone} cnpj=${cnpj}`);
    return null; // Simula: não existe deal anterior
  }

  const query = cnpj ?? phone;
  if (!query) return null;

  const r = await crmRequest("GET", `/deals?query=${encodeURIComponent(query)}&page_size=1`);
  if (r.ok && r.data?.deals?.length > 0) {
    return r.data.deals[0].id;
  }
  return null;
}

// ─── Montar payload do deal ───────────────────────────────────────────────────

function buildDealPayload(session: ContactSession, cnpjData?: CnpjData | null) {
  const fd = session.flowData;
  const subFlow = session.currentSubFlow ?? "";
  const funnelName = FUNNELS[subFlow] ?? "Outros";

  const note = buildDealNote(session, cnpjData);

  const payload: Record<string, any> = {
    name: fd.clientName
      ? `${fd.clientName}${fd.companyName ? ` — ${fd.companyName}` : ""}`
      : `Contato ${session.contactId}`,
    funnel: { name: funnelName },
    contacts_attributes: [],
    note,
  };

  // Contato
  const contact: Record<string, any> = { name: fd.clientName ?? "Desconhecido" };
  if (fd.clientPhone ?? session.contactPhone) {
    contact.phones = [{ phone: fd.clientPhone ?? session.contactPhone }];
  }
  if (fd.companyName ?? cnpjData?.razao_social) {
    contact.company = { name: fd.companyName ?? cnpjData?.razao_social };
  }
  payload.contacts_attributes = [contact];

  // Campos extras
  if (fd.clientCnpj ?? fd.clientCpf) {
    payload.cf_cnpj_cpf = fd.clientCnpj ?? fd.clientCpf;
  }
  if (fd.productType) payload.cf_produto = fd.productType;
  if (fd.productVolume) payload.cf_volume = fd.productVolume;
  if (fd.interestLevel) payload.cf_interesse = fd.interestLevel;
  if (fd.problemDescription) payload.cf_descricao_problema = fd.problemDescription;
  if (session.currentSubFlow) payload.cf_subfluxo = session.currentSubFlow;

  return payload;
}

function buildDealNote(session: ContactSession, cnpjData?: CnpjData | null): string {
  const fd = session.flowData;
  const lines: string[] = ["=== RELATÓRIO FAGNER ===", ""];

  lines.push(`Fluxo: ${session.currentFlow} — ${session.currentSubFlow ?? "n/a"}`);
  if (fd.clientName) lines.push(`Cliente: ${fd.clientName}`);
  if (fd.clientCnpj) lines.push(`CNPJ: ${fd.clientCnpj}`);
  if (fd.clientCpf) lines.push(`CPF: ${fd.clientCpf}`);
  if (fd.companyName) lines.push(`Empresa: ${fd.companyName}`);
  if (fd.clientPhone ?? session.contactPhone) lines.push(`Telefone: ${fd.clientPhone ?? session.contactPhone}`);

  if (fd.productType) lines.push(`\nProduto: ${fd.productType}`);
  if (fd.productCategory) lines.push(`Categoria: ${fd.productCategory}`);
  if (fd.productProcess) lines.push(`Processo atual: ${fd.productProcess}`);
  if (fd.productVolume) lines.push(`Volume: ${fd.productVolume}`);
  if (fd.isNewClient !== undefined) lines.push(`Cliente novo: ${fd.isNewClient ? "Sim" : "Não"}`);
  if (fd.interestLevel) lines.push(`Interesse: ${fd.interestLevel}`);

  if (fd.problemDescription) lines.push(`\nProblema relatado: ${fd.problemDescription}`);
  if (fd.supportType) lines.push(`Tipo de suporte: ${fd.supportType}`);
  if (fd.orderNumber) lines.push(`Pedido: ${fd.orderNumber}`);
  if (fd.boletoData) lines.push(`Dados boleto: ${fd.boletoData}`);
  if (fd.nfData) lines.push(`Dados NF: ${fd.nfData}`);

  if (fd.creditEligible !== undefined) {
    lines.push(`\nAnálise de Crédito:`);
    lines.push(`  Protestos (CENPROT): ${fd.hasProtests ? "SIM" : "Não"}`);
    lines.push(`  Elegível parcelamento: ${fd.creditEligible ? "Sim" : "NÃO — apenas à vista/cartão"}`);
    lines.push(`  Modo pagamento: ${fd.paymentMode === "avista" ? "À vista / Cartão" : "Normal"}`);
  }

  if (cnpjData) {
    lines.push(`\nDados Receita Federal:`);
    lines.push(`  Razão Social: ${cnpjData.razao_social}`);
    if (cnpjData.nome_fantasia) lines.push(`  Fantasia: ${cnpjData.nome_fantasia}`);
    if (cnpjData.situacao) lines.push(`  Situação: ${cnpjData.situacao}`);
    if (cnpjData.porte) lines.push(`  Porte: ${cnpjData.porte}`);
    if (cnpjData.cnae_principal) lines.push(`  CNAE: ${cnpjData.cnae_principal.descricao}`);
    if (cnpjData.municipio) lines.push(`  Localização: ${cnpjData.municipio}/${cnpjData.uf}`);
    if (cnpjData.simples !== null) lines.push(`  Simples: ${cnpjData.simples ? "Sim" : "Não"}`);
  }

  if (session.mediaMemory.length > 0) {
    lines.push(`\nMídias recebidas: ${session.mediaMemory.length}`);
    session.mediaMemory.forEach((m, i) => {
      lines.push(`  ${i + 1}. [${m.type.toUpperCase()}] ${m.analysis ?? m.transcription ?? ""}`);
    });
  }

  if (session.productNotes.length > 0) {
    lines.push(`\nProdutos/códigos mencionados: ${session.productNotes.join(", ")}`);
  }

  if (fd.notes) lines.push(`\nObservações: ${fd.notes}`);

  lines.push(`\nHorário: ${new Date().toLocaleString("pt-BR")}`);

  return lines.join("\n");
}

// ─── Criar novo deal ──────────────────────────────────────────────────────────

export async function createDeal(
  session: ContactSession,
  cnpjData?: CnpjData | null
): Promise<string | null> {
  const payload = buildDealPayload(session, cnpjData);
  const r = await crmRequest("POST", "/deals", payload);

  if (r.ok) {
    const dealId = r.data?.id ?? r.data?.deal?.id;
    console.log(`[RD CRM] Deal criado: ${dealId} (${payload.name})`);
    return dealId;
  }

  console.error("[RD CRM] Falha ao criar deal:", r.data);
  return null;
}

// ─── Atualizar deal existente ─────────────────────────────────────────────────

export async function updateDeal(
  dealId: string,
  session: ContactSession,
  cnpjData?: CnpjData | null
): Promise<boolean> {
  const payload = buildDealPayload(session, cnpjData);
  const r = await crmRequest("PUT", `/deals/${dealId}`, payload);

  if (r.ok) {
    console.log(`[RD CRM] Deal atualizado: ${dealId}`);
    return true;
  }

  console.error(`[RD CRM] Falha ao atualizar deal ${dealId}:`, r.data);
  return false;
}

// ─── Criar ou atualizar (upsert) ──────────────────────────────────────────────

export async function upsertDeal(
  session: ContactSession,
  cnpjData?: CnpjData | null
): Promise<string | null> {
  const fd = session.flowData;

  // Fluxos sem card no CRM
  if (session.currentSubFlow === "2C_OUTROS" || session.currentSubFlow === "5B_CURRICULO") {
    console.log(`[RD CRM] Subfluxo ${session.currentSubFlow} não gera card.`);
    return null;
  }

  const existingId = await findExistingDeal(
    fd.clientPhone ?? session.contactPhone ?? undefined,
    fd.clientCnpj ?? undefined
  );

  if (existingId) {
    await updateDeal(existingId, session, cnpjData);
    return existingId;
  }

  return await createDeal(session, cnpjData);
}
