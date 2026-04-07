/**
 * rdCrmService.ts
 * Serviço de integração com o RD Station CRM v2 para criação automática
 * de OS de Pós Venda (Contato + Negociação + Anotação).
 *
 * Fonte de verdade da API: /RD STATION CRM - API COMPLETA.txt no projeto.
 * NUNCA buscar endpoints ou contratos na internet.
 */

import db from "../db.js";
import { lcVisitors, settings } from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";

// ─── Constantes ────────────────────────────────────────────────────────────────
const RD_API_BASE = "https://api.rd.services/crm/v2";
const RD_AUTH_URL = "https://api.rd.services/oauth2/token";
const DB_KEY_ACCESS  = "rd_crm_access_token";
const DB_KEY_REFRESH = "rd_crm_refresh_token";
const DB_KEY_EXPIRES = "rd_crm_token_expires_at";

let _sourceId:   string | null = null;
let _campaignId: string | null = null;
let _customFieldsCache: { id: string; name: string }[] | null = null;

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface CnpjData {
  nome: string;           // razão social
  fantasia?: string;
  cnpj: string;
  logradouro?: string;
  municipio?: string;
  uf?: string;
  bairro?: string;
  situacao?: string;
  // campos expandidos da CNPJ.ws
  numero?: string;
  cep?: string;
  dataAbertura?: string;
  capitalSocial?: string;
  porte?: string;
  naturezaJuridica?: string;
  matrizFilial?: string;
  cnaePrincipal?: string;
  cnaesSecundarios?: string;
  socios?: string;
  telefone1?: string;
  telefone2?: string;
  email?: string;
}

export interface PosVendaData {
  nome: string;
  telefone: string;
  email?: string | null;
  cnpjCpf?: string | null;
  notaPedido?: string | null;
  problema: string;
  cnpjData?: CnpjData | null;   // dados da cnpj.ws, se disponíveis (apenas para CNPJ)
  conversationSummary?: string | null; // resumo da conversa para informações complementares
}

interface RdToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp ms
}

// ─── Token storage com persistência no banco (sobrevive a restarts do Railway) ─
let _tokenCache: RdToken | null = null;

async function loadTokenFromDb(): Promise<RdToken | null> {
  try {
    const rows = await db.select().from(settings)
      .where(sql`key IN (${DB_KEY_ACCESS}, ${DB_KEY_REFRESH}, ${DB_KEY_EXPIRES})`);

    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value ?? "";

    const at  = map[DB_KEY_ACCESS]  || process.env.RD_CRM_ACCESS_TOKEN;
    const rt  = map[DB_KEY_REFRESH] || process.env.RD_CRM_REFRESH_TOKEN;
    const exp = parseInt(map[DB_KEY_EXPIRES] ?? "0", 10) || Date.now();

    if (!at || !rt) return null;
    return { accessToken: at, refreshToken: rt, expiresAt: exp };
  } catch {
    const at = process.env.RD_CRM_ACCESS_TOKEN;
    const rt = process.env.RD_CRM_REFRESH_TOKEN;
    if (!at || !rt) return null;
    return { accessToken: at, refreshToken: rt, expiresAt: Date.now() };
  }
}

async function saveTokenToDb(token: RdToken): Promise<void> {
  _tokenCache = token;
  process.env.RD_CRM_ACCESS_TOKEN  = token.accessToken;
  process.env.RD_CRM_REFRESH_TOKEN = token.refreshToken;

  const upsert = async (key: string, value: string) => {
    const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      // 'settings' tem id PK — usamos a key como id também para tokens RD CRM
      await db.insert(settings).values({ id: `rd_crm_${key}`, key, value });
    }
  };

  try {
    await upsert(DB_KEY_ACCESS,  token.accessToken);
    await upsert(DB_KEY_REFRESH, token.refreshToken);
    await upsert(DB_KEY_EXPIRES, token.expiresAt.toString());
    console.log("[RD CRM] Tokens persistidos no banco com sucesso.");
  } catch (e: any) {
    console.warn("[RD CRM] Falha ao persistir tokens no banco:", e.message);
  }
}

async function refreshAccessToken(): Promise<RdToken> {
  const current      = _tokenCache ?? await loadTokenFromDb();
  const clientId     = process.env.RD_CRM_CLIENT_ID!;
  const clientSecret = process.env.RD_CRM_CLIENT_SECRET!;
  const refreshToken = current?.refreshToken ?? process.env.RD_CRM_REFRESH_TOKEN!;

  if (!refreshToken) {
    throw new Error("[RD CRM] Nenhum refresh_token disponível. Configure RD_CRM_REFRESH_TOKEN no Railway.");
  }

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  });

  const res = await fetch(RD_AUTH_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[RD CRM] Falha ao renovar token: ${res.status} ${err}`);
  }

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const token: RdToken = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + (data.expires_in * 1000),
  };
  await saveTokenToDb(token);
  console.log("[RD CRM] Token renovado e persistido com sucesso.");
  return token;
}

/** Retorna um access_token válido, renovando se necessário. */
async function getValidToken(): Promise<string> {
  if (!_tokenCache) {
    _tokenCache = await loadTokenFromDb();
  }
  // Renova se expirar em menos de 5 minutos ou se o expiresAt já passou
  if (!_tokenCache || _tokenCache.expiresAt - Date.now() < 5 * 60_000) {
    _tokenCache = await refreshAccessToken();
  }
  return _tokenCache.accessToken;
}

/** Alias público para uso externo (ex: livechatRoutes) */
export { getValidToken as getRdValidToken };

// ─── Helper de requisição ────────────────────────────────────────────────────

async function rdRequest<T = any>(
  method: string,
  path: string,
  body?: object,
  retried = false
): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${RD_API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  if (body) console.log(`[RD CRM] ${method} ${path} body:`, JSON.stringify({ data: body }));


  // Token expirado: força refresh e tenta de novo (uma vez)
  if (res.status === 401 && !retried) {
    _tokenCache = null;
    return rdRequest<T>(method, path, body, true);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`[RD CRM] ${method} ${path} → ${res.status}: ${errBody}`);
  }

  // 204 No Content (DELETE) não tem corpo
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return json.data as T;
}

// ─── Source / Campaign: busca por nome, cria se não existir ──────────────────
async function getOrCreateSourceId(): Promise<string> {
  if (_sourceId) return _sourceId;
  const name = "Referência | tecfag.com.br";
  try {
    // Busca nas 3 páginas
    for (let page = 1; page <= 3; page++) {
      const data = await rdRequest<any[]>("GET", `/sources?page[number]=${page}&page[size]=50`);
      const found = (Array.isArray(data) ? data : []).find((s: any) => s.name === name);
      if (found) { _sourceId = found.id; return _sourceId!; }
    }
    // Não encontrou — cria
    const created = await rdRequest<{ id: string }>("POST", "/sources", { name });
    _sourceId = created.id;
    console.log(`[RD CRM] Fonte criada: ${_sourceId}`);
  } catch (e: any) {
    console.warn("[RD CRM] Não foi possível obter source_id:", e.message);
    _sourceId = "";
  }
  return _sourceId!;
}

async function getOrCreateCampaignId(): Promise<string> {
  if (_campaignId) return _campaignId;
  const name = "Fagner | Vtex";
  try {
    for (let page = 1; page <= 2; page++) {
      const data = await rdRequest<any[]>("GET", `/campaigns?page[number]=${page}&page[size]=50`);
      const found = (Array.isArray(data) ? data : []).find((c: any) => c.name === name);
      if (found) { _campaignId = found.id; return _campaignId!; }
    }
    const created = await rdRequest<{ id: string }>("POST", "/campaigns", { name });
    _campaignId = created.id;
    console.log(`[RD CRM] Campanha criada: ${_campaignId}`);
  } catch (e: any) {
    console.warn("[RD CRM] Não foi possível obter campaign_id:", e.message);
    _campaignId = "";
  }
  return _campaignId!;
}

// ─── Busca dinâmica de custom fields de Deals ──────────────────────────────────
async function loadDealCustomFields(): Promise<{ id: string; name: string }[]> {
  if (_customFieldsCache) return _customFieldsCache;
  try {
    const data = await rdRequest<any[]>("GET", "/deals/custom_fields");
    if (Array.isArray(data)) {
      _customFieldsCache = data.map(f => ({ id: f.id, name: f.name.toLowerCase() }));
      return _customFieldsCache;
    }
  } catch (e: any) {
    console.warn("[RD CRM] Falha ao carregar campos personalizados do deal:", e.message);
  }
  return [];
}

// ─── Empresa (Organization) — CNPJ ou CPF ────────────────────────────────────

/**
 * Para CNPJ: busca por CNPJ no campo custom, cria com razão social + campos da Receita.
 * Para CPF: cria empresa com nome do cliente e preenche campo CPF.
 * Retorna o organizationId ou null em caso de falha.
 */
async function findOrCreateOrganization(
  posVenda: PosVendaData
): Promise<string | null> {
  const doc = (posVenda.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = doc.length === 14;
  const isCpf  = doc.length === 11;

  if (!isCnpj && !isCpf) return null;

  try {
    if (isCnpj && posVenda.cnpjData) {
      const cnpjData = posVenda.cnpjData;
      const cnpjNum  = cnpjData.cnpj.replace(/\D/g, "");

      // 1. Tenta buscar pelo campo personalizado CNPJ
      try {
        const byField = await rdRequest<any[]>(
          "GET",
          `/organizations?filter=@cnpj:${encodeURIComponent(cnpjNum)}`
        );
        if (Array.isArray(byField) && byField.length > 0) {
          console.log(`[RD CRM] Empresa existente (por CNPJ custom): ${byField[0].id}`);
          return byField[0].id;
        }
      } catch {}

      // 2. Tenta buscar pela razão social
      try {
        const byName = await rdRequest<any[]>(
          "GET",
          `/organizations?filter=name:${encodeURIComponent(cnpjData.nome)}`
        );
        if (Array.isArray(byName) && byName.length > 0) {
          console.log(`[RD CRM] Empresa existente (por nome): ${byName[0].id}`);
          return byName[0].id;
        }
      } catch {}

      // 3. Cria empresa nova (CNPJ)
      const orgPayload: Record<string, any> = {
        name: cnpjData.nome,
        custom_fields: {
          cnpj: cnpjNum,
        },
      };

      // Campos opcionais — só preenche se a Receita retornou
      if (cnpjData.municipio) orgPayload.city    = cnpjData.municipio;
      if (cnpjData.uf)        orgPayload.state   = cnpjData.uf;
      if (cnpjData.bairro)    orgPayload.district = cnpjData.bairro;

      const org = await rdRequest<{ id: string }>("POST", "/organizations", orgPayload);
      console.log(`[RD CRM] Empresa criada (CNPJ): ${org.id} — ${cnpjData.nome}`);
      return org.id;

    } else if (isCpf) {
      // Para CPF: empresa com nome do cliente
      const nomeEmpresa = posVenda.nome;

      // Tenta buscar pelo nome do cliente
      try {
        const byName = await rdRequest<any[]>(
          "GET",
          `/organizations?filter=name:${encodeURIComponent(nomeEmpresa)}`
        );
        if (Array.isArray(byName) && byName.length > 0) {
          console.log(`[RD CRM] Empresa CPF existente (por nome): ${byName[0].id}`);
          return byName[0].id;
        }
      } catch {}

      // Cria empresa com CPF no campo personalizado
      const orgPayload: Record<string, any> = {
        name: nomeEmpresa,
        custom_fields: {
          cpf: doc, // campo CPF da empresa no RD
        },
      };

      const org = await rdRequest<{ id: string }>("POST", "/organizations", orgPayload);
      console.log(`[RD CRM] Empresa criada (CPF): ${org.id} — ${nomeEmpresa}`);
      return org.id;
    }

    return null;
  } catch (e: any) {
    console.warn("[RD CRM] Não foi possível criar/buscar empresa:", e.message);
    return null;
  }
}

// ─── Contatos ────────────────────────────────────────────────────────────────
async function findContactByPhone(phone: string): Promise<{ id: string } | null> {
  const normalized = phone.replace(/\D/g, "");
  try {
    const data = await rdRequest<any[]>("GET", `/contacts?filter=phone:${normalized}`);
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

/**
 * Atualiza um contato existente com o e-mail caso o campo esteja ausente.
 * Garante que o e-mail nunca fique em branco por causa do "contato já existe".
 */
async function updateContactEmailIfMissing(
  contactId: string,
  email: string | null | undefined
): Promise<void> {
  if (!email) return;
  try {
    // Verifica se o contato já tem e-mail
    const existing = await rdRequest<any>("GET", `/contacts/${contactId}`);
    const emails: any[] = existing?.emails ?? [];
    const alreadyHasEmail = emails.some((e: any) => e.email && e.email.trim().length > 0);

    if (!alreadyHasEmail) {
      await rdRequest("PUT", `/contacts/${contactId}`, {
        emails: [{ email }],
        custom_fields: { e_mail: email },
      });
      console.log(`[RD CRM] E-mail atualizado no contato ${contactId}: ${email}`);
    } else {
      console.log(`[RD CRM] Contato ${contactId} já possui e-mail — sem atualização.`);
    }
  } catch (e: any) {
    console.warn(`[RD CRM] Falha ao atualizar e-mail do contato ${contactId}:`, e.message);
  }
}

async function findOrCreateContact(posVenda: PosVendaData): Promise<string> {
  const existing = await findContactByPhone(posVenda.telefone);

  if (existing) {
    console.log(`[RD CRM] Contato existente encontrado: ${existing.id}`);
    // FIX: Atualiza e-mail no contato existente se estiver faltando
    await updateContactEmailIfMissing(existing.id, posVenda.email);
    return existing.id;
  }

  const contactPayload: Record<string, any> = {
    name:   posVenda.nome,
    phones: [{ phone: posVenda.telefone.replace(/\D/g, ""), type: "mobile" }],
    legal_bases: [{
      category: "data_processing",
      type:     "pre_existent_contract",
      status:   "granted",
    }],
  };

  if (posVenda.email) {
    contactPayload.emails         = [{ email: posVenda.email }];
    contactPayload.custom_fields  = { e_mail: posVenda.email };
  }

  const contact = await rdRequest<{ id: string }>("POST", "/contacts", contactPayload);
  console.log(`[RD CRM] Contato criado: ${contact.id}`);
  return contact.id;
}

// ─── Negociações ─────────────────────────────────────────────────────────────

/**
 * Cria a negociação no RD CRM.
 *
 * - Título: "FAGNER - NOME DO CLIENTE" (sem "Pós Venda")
 * - Informações complementares: resumo real da conversa e problema do cliente
 */
async function createDeal(
  posVenda: PosVendaData,
  contactId: string,
  organizationId?: string | null
): Promise<string> {
  // ── FIX 1: Título sem "Pós Venda", apenas FAGNER - NOME ──────────────────────
  const titulo = `FAGNER - ${posVenda.nome}`;

  // ── FIX 2: Informações Complementares = resumo real do atendimento ─────────
  // Usa o resumo da conversa se disponível, senão monta um texto descritivo do problema
  let infoCompl: string;
  if (posVenda.conversationSummary) {
    infoCompl = posVenda.conversationSummary;
  } else {
    // Fallback: resumo estruturado das informações coletadas
    const partes: string[] = [];
    partes.push(`Problema: ${posVenda.problema}`);
    if (posVenda.cnpjCpf)     partes.push(`Documento: ${posVenda.cnpjCpf}`);
    if (posVenda.notaPedido)  partes.push(`Nota Fiscal: ${posVenda.notaPedido}`);
    if (posVenda.email)       partes.push(`E-mail: ${posVenda.email}`);
    infoCompl = partes.join(" | ");
  }

  const pipelineId = (process.env.RD_CRM_PIPELINE_OS_ID ?? "67c9f944c7fe880018b30ab1").trim();
  const stageId    = (process.env.RD_CRM_PIPELINE_OS_STAGE_ID ?? "").trim();
  const ownerId    = (process.env.RD_CRM_OWNER_POS_VENDA_ID ?? "").trim();

  if (!stageId) throw new Error("[RD CRM] RD_CRM_PIPELINE_OS_STAGE_ID não configurado");
  if (!ownerId) throw new Error("[RD CRM] RD_CRM_OWNER_POS_VENDA_ID não configurado");

  // Busca IDs de fonte e campanha (cria se não existir)
  const [sourceId, campaignId] = await Promise.all([
    getOrCreateSourceId(),
    getOrCreateCampaignId(),
  ]);

  console.log(`[RD CRM] Criando deal "${titulo}": pipeline=${pipelineId} stage=${stageId}`);

  const payloadData: Record<string, any> = {
    deal: {
      name:        titulo,
      deal_stage_id: stageId,
      deal_source_id: sourceId || undefined,
      campaign_id: campaignId || undefined,
      user_id: ownerId, // Dono do deal
    }
  };

  const dealPayload: Record<string, any> = {
    name:        titulo,
    pipeline_id: pipelineId,
    stage_id:    stageId,
    owner_id:    ownerId,
    contact_ids: [contactId],
    status:      "ongoing",
    rating:      1,  // Muito baixa intenção - FRIO (pós-venda)
    deal_custom_fields: []
  };

  if (sourceId)       dealPayload.source_id       = sourceId;
  if (campaignId)     dealPayload.campaign_id     = campaignId;
  if (organizationId) dealPayload.organization_id = organizationId;

  // Busca campos personalizados dinamicamente 
  const cfs = await loadDealCustomFields();
  const infoField = cfs.find((f: any) => f.name.includes("complementar"));
  
  if (infoField) {
    dealPayload.deal_custom_fields.push({
      custom_field_id: infoField.id,
      value: infoCompl
    });
  } else {
    // Tenta fallback com o formato antigo de objeto (funciona em alguns endpoints)
    dealPayload.custom_fields = { informacoes_complementares: infoCompl };
  }

  const deal = await rdRequest<{ id: string }>("POST", "/deals", dealPayload);
  console.log(`[RD CRM] Negociação criada: ${deal.id} — "${titulo}"`);
  return deal.id;
}

// ─── Anotações ───────────────────────────────────────────────────────────────
/**
 * Cria uma anotação com o relatório completo do Fagner na negociação.
 */
async function createNote(dealId: string, relatorio: string): Promise<void> {
  await rdRequest("POST", `/deals/${dealId}/notes`, { description: relatorio });
  console.log(`[RD CRM] Anotação criada na negociação ${dealId}`);
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function createPosVendaOS(
  visitorId: string,
  posVenda: PosVendaData,
  relatorio: string
): Promise<string> {
  if (!process.env.RD_CRM_CLIENT_ID || !process.env.RD_CRM_PIPELINE_OS_STAGE_ID) {
    throw new Error("[RD CRM] Variáveis de ambiente RD CRM não configuradas.");
  }

  const [visitor] = await db.select({ rdCrmDealId: lcVisitors.rdCrmDealId })
    .from(lcVisitors)
    .where(eq(lcVisitors.id, visitorId));

  if (visitor?.rdCrmDealId) {
    console.log(`[RD CRM] Visitante ${visitorId} já tem OS: ${visitor.rdCrmDealId}. Pulando criação.`);
    return visitor.rdCrmDealId;
  }

  console.log(`[RD CRM] Criando OS de Pós Venda para visitante ${visitorId}...`);

  // 1. Contato (cria ou busca, e atualiza e-mail se necessário)
  const contactId = await findOrCreateContact(posVenda);

  // 2. Empresa — para CNPJ: usa dados da Receita. Para CPF: cria com nome do cliente.
  let organizationId: string | null = null;
  const docDigits = (posVenda.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = docDigits.length === 14;
  const isCpf  = docDigits.length === 11;

  if (isCnpj && posVenda.cnpjData) {
    // CNPJ com dados da Receita disponíveis
    organizationId = await findOrCreateOrganization(posVenda);
  } else if (isCpf) {
    // CPF: cria empresa com o nome do cliente
    organizationId = await findOrCreateOrganization(posVenda);
  }
  // Se não tem CNPJ nem CPF, não cria empresa

  // 3. Negociação
  const dealId = await createDeal(posVenda, contactId, organizationId);

  // 4. Anotação com relatório completo
  await createNote(dealId, relatorio);

  // 5. Persistir o dealId no visitante
  await db.update(lcVisitors)
    .set({ rdCrmDealId: dealId })
    .where(eq(lcVisitors.id, visitorId));

  console.log(`[RD CRM] ✅ OS criada com sucesso! Deal ID: ${dealId}`);
  return dealId;
}

/**
 * Verifica se o ambiente RD CRM está corretamente configurado.
 */
export function isRdCrmConfigured(): boolean {
  return !!(
    process.env.RD_CRM_CLIENT_ID &&
    process.env.RD_CRM_CLIENT_SECRET &&
    (process.env.RD_CRM_ACCESS_TOKEN || process.env.RD_CRM_REFRESH_TOKEN) &&
    process.env.RD_CRM_PIPELINE_OS_STAGE_ID &&
    process.env.RD_CRM_OWNER_POS_VENDA_ID
  );
}
