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
let _orgCustomFieldsCache: { id: string; name: string; slug: string }[] | null = null;

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

export interface MaquinasData {
  nome: string;
  telefone: string;
  email?: string | null;
  cnpjCpf?: string | null;
  cnpjData?: CnpjData | null;
  maquinaDesejada: string;
  detalhes?: string | null;
  produtoFabricado?: string | null;
  volumeProducao?: string | null;
  clienteNovo?: string | null;          // SIM / NAO / PEÇAS
  qualificacaoSDR?: string | null;      // "1" a "6"
  conversationSummary?: string | null;
  ownerId?: string | null;              // vem do painel Settings (rodízio)
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

  // PASSO 1: Busca listagem completa (sem filtro RDQL que pode falhar com 400/422)
  try {
    const allData = await rdRequest<any>("GET", "/sources?page[size]=100");
    // rdRequest já faz json.data, então allData é o array diretamente
    const list: any[] = Array.isArray(allData) ? allData : [];
    console.log(`[RD CRM] GET /sources: ${list.length} fontes carregadas`);

    const found = list.find((s: any) => s.name === name);
    if (found) {
      _sourceId = found.id;
      console.log(`[RD CRM] ✅ Fonte encontrada: ${_sourceId} ("${name}")`);
      return _sourceId!;
    }
    console.log(`[RD CRM] Fonte "${name}" não encontrada nas ${list.length} fontes. Criando...`);
  } catch (listErr: any) {
    console.error("[RD CRM] ❌ Falha ao listar fontes:", listErr.message);
  }

  // PASSO 2: Cria a fonte
  try {
    const created = await rdRequest<{ id: string }>("POST", "/sources", { name });
    _sourceId = created.id;
    console.log(`[RD CRM] ✅ Fonte criada: ${_sourceId} ("${name}")`);
  } catch (createErr: any) {
    console.error("[RD CRM] ❌ Falha ao criar fonte:", createErr.message);
    // Sem cachear erro — próxima chamada tenta de novo
  }

  return _sourceId ?? "";
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

// ── Busca dinâmica de custom fields de Deals ──────────────────────────────────────
// Endpoint oficial API v2: GET /custom_fields?filter=entity:deal
// Retorna lista com id, name e SLUG dos campos personalizados de Negociação
async function loadDealCustomFields(): Promise<{ id: string; name: string; slug: string }[]> {
  if (_customFieldsCache && (_customFieldsCache as any[]).length > 0) return _customFieldsCache as any[];

  const tryLoad = async (url: string): Promise<any[]> => {
    try {
      const data = await rdRequest<any>("GET", url);
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      return list;
    } catch (e: any) {
      console.warn(`[RD CRM] Falha ao chamar ${url}:`, e.message);
      return [];
    }
  };

  // Tenta primeiro com filtro entity:deal
  let list = await tryLoad("/custom_fields?filter=entity:deal&page[size]=100");

  // Fallback: sem filtro (retorna todos os campos e filtra client-side)
  if (list.length === 0) {
    console.warn('[RD CRM] entity:deal retornou vazio — tentando /custom_fields sem filtro');
    const all = await tryLoad('/custom_fields?page[size]=200');
    list = all.filter((f: any) =>
      !f.entity || f.entity === 'deal' || f.entity?.includes?.('deal')
    );
    if (list.length === 0) list = all; // último recurso: usa todos
  }

  if (list.length > 0) {
    _customFieldsCache = list.map((f: any) => ({
      id:   f.id   ?? '',
      name: (f.name  || '').toLowerCase(),
      slug: (f.slug  || '').toLowerCase(),
    })) as any;
    console.log(`[RD CRM] ${list.length} campos deal carregados:`,
      (_customFieldsCache as any[]).map((f: any) => `${f.name}(id:${f.id})`).join(', '));
    return _customFieldsCache as any[];
  }

  console.warn('[RD CRM] Nenhum custom field de deal encontrado — custom_fields será omitido dos deals');
  return [];
}

// ── Campos personalizados de Organization — cache de UUIDs ────────────────────
// Conforme screenshot do CRM: "CNPJ ou CPF" (obrigatório), Cidade, Bairro, Estado
interface OrgFieldIds {
  cnpjCpf?: string;
  cidade?:  string;
  bairro?:  string;
  estado?:  string;
}
let _orgFieldIds: OrgFieldIds | null = null;

/**
 * Faz GET /custom_fields?filter=entity:organization UMA VEZ e extrai os UUIDs
 * dos 4 campos personalizados visíveis no formulário de empresa do RD CRM.
 * Resultado em cache — não repete a chamada.
 */
async function loadOrgFieldIds(): Promise<OrgFieldIds> {
  if (_orgFieldIds) return _orgFieldIds;

  const ids: OrgFieldIds = {};

  try {
    const data = await rdRequest<any>("GET", "/custom_fields?filter=entity:organization&page[size]=100");
    const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

    // Atualiza cache legado também
    if (list.length > 0) {
      _orgCustomFieldsCache = list.map((f: any) => ({
        id: f.id ?? '', name: (f.name || '').toLowerCase(), slug: (f.slug || '').toLowerCase(),
      }));
    }

    for (const f of list) {
      const s = (f.slug || '').toLowerCase();
      const n = (f.name || '').toLowerCase();
      if (!ids.cnpjCpf && (s.includes('cnpj') || s.includes('cpf') || n.includes('cnpj') || n.includes('cpf') || n.includes('documento'))) {
        ids.cnpjCpf = f.id;
        console.log(`[RD CRM] Campo CNPJ/CPF org: id=${f.id} name="${f.name}" slug=${f.slug}`);
      } else if (!ids.cidade && (s.includes('cidade') || s.includes('city') || s.includes('municipio') || n.includes('cidade') || n.includes('municipio'))) {
        ids.cidade = f.id;
        console.log(`[RD CRM] Campo Cidade org: id=${f.id} name="${f.name}"`);
      } else if (!ids.bairro && (s.includes('bairro') || s.includes('district') || n.includes('bairro') || n.includes('district'))) {
        ids.bairro = f.id;
        console.log(`[RD CRM] Campo Bairro org: id=${f.id} name="${f.name}"`);
      } else if (!ids.estado && (s.includes('estado') || s.includes('state') || s.includes('_uf') || s === 'uf' || n.includes('estado') || n === 'uf')) {
        ids.estado = f.id;
        console.log(`[RD CRM] Campo Estado org: id=${f.id} name="${f.name}"`);
      }
    }

    if (!ids.cnpjCpf) {
      console.warn(`[RD CRM] ⚠️ Campo CNPJ/CPF NÃO encontrado nos ${list.length} campos de org. Nomes: ${list.map(f => f.name).join(', ')}`);
    }
  } catch (e: any) {
    console.warn(`[RD CRM] Falha ao carregar campos de org: ${e.message}`);
  }

  _orgFieldIds = ids;
  return ids;
}

// Mantém _cnpjFieldId para compatibilidade com código legado
let _cnpjFieldId: string | null = null;
async function getOrCreateCnpjFieldId(): Promise<string | null> {
  const ids = await loadOrgFieldIds();
  _cnpjFieldId = ids.cnpjCpf ?? null;
  return _cnpjFieldId;
}

// ─── Empresa (Organization) — CNPJ ou CPF ────────────────────────────────────

/**
 * Para CNPJ: busca por CNPJ no campo custom, cria com razão social + campos da Receita.
 * Para CPF: cria empresa com nome do cliente e preenche campo CPF.
 * Retorna the organizationId ou null em caso de falha.
 */
async function findOrCreateOrganization(
  posVenda: PosVendaData
): Promise<string | null> {
  const doc = (posVenda.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = doc.length === 14;
  const isCpf  = doc.length === 11;

  if (!isCnpj && !isCpf) return null;

  // Para CNPJ: usa razão social da Receita; para CPF: usa nome do cliente
  const nomeEmpresa = (isCnpj && posVenda.cnpjData?.nome) ? posVenda.cnpjData.nome : posVenda.nome;

  try {
    // ── 1. Busca empresa existente ────────────────────────────────────────────
    // Por campo personalizado CNPJ/CPF (slug padrão do RD CRM)
    try {
      const byField = await rdRequest<any[]>("GET", `/organizations?filter=@cnpj_cpf:${encodeURIComponent(doc)}`);
      if (Array.isArray(byField) && byField.length > 0) {
        console.log(`[RD CRM] ✅ Empresa existente (campo CNPJ/CPF): ${byField[0].id}`);
        return byField[0].id;
      }
    } catch {}

    // Por nome (evitar duplicata)
    try {
      const byName = await rdRequest<any[]>("GET", `/organizations?filter=name:${encodeURIComponent(nomeEmpresa)}`);
      if (Array.isArray(byName) && byName.length > 0) {
        console.log(`[RD CRM] ✅ Empresa existente (nome): ${byName[0].id} — "${nomeEmpresa}"`);
        return byName[0].id;
      }
    } catch {}

    // ── 2. Carrega todos UUIDs dos campos personalizados de org ───────────────
    const fieldIds = await loadOrgFieldIds();

    // ── 3. Monta payload — custom_fields com os UUIDs reais ──────────────────
    const customFields: Record<string, string> = {};

    // CNPJ ou CPF (obrigatório no CRM conforme screenshot)
    if (fieldIds.cnpjCpf && doc) {
      customFields[fieldIds.cnpjCpf] = doc;
    }
    // Cidade (da Receita Federal, se disponível)
    if (fieldIds.cidade && posVenda.cnpjData?.municipio) {
      customFields[fieldIds.cidade] = posVenda.cnpjData.municipio;
    }
    // Bairro
    if (fieldIds.bairro && posVenda.cnpjData?.bairro) {
      customFields[fieldIds.bairro] = posVenda.cnpjData.bairro;
    }
    // Estado
    if (fieldIds.estado && posVenda.cnpjData?.uf) {
      customFields[fieldIds.estado] = posVenda.cnpjData.uf;
    }

    const orgPayload: Record<string, any> = { name: nomeEmpresa };
    if (Object.keys(customFields).length > 0) orgPayload.custom_fields = customFields;
    if (posVenda.cnpjData?.telefone1) orgPayload.phone = posVenda.cnpjData.telefone1;

    console.log(`[RD CRM] Criando empresa "${nomeEmpresa}" doc=${doc} custom_fields=${JSON.stringify(customFields)}`);


    const org = await rdRequest<{ id: string }>("POST", "/organizations", orgPayload);
    console.log(`[RD CRM] ✅ Empresa criada: ${org.id} — "${nomeEmpresa}" (doc: ${doc})`);
    return org.id;

  } catch (e: any) {
    console.error(`[RD CRM] ❌ Falha ao criar empresa "${nomeEmpresa}": ${e.message}`);
    // Último recurso: empresa sem custom_fields
    try {
      const orgMin = await rdRequest<{ id: string }>("POST", "/organizations", { name: nomeEmpresa });
      console.log(`[RD CRM] ✅ Empresa mínima (fallback): ${orgMin.id}`);
      return orgMin.id;
    } catch (e2: any) {
      console.error(`[RD CRM] ❌ Fallback falhou: ${e2.message}`);
      return null;
    }
  }
}



// ─── Contatos ────────────────────────────────────────────────────────────────
async function upsertContact(posVenda: PosVendaData, organizationId?: string | null): Promise<string> {
  let docDigits = (posVenda.cnpjCpf ?? "").replace(/\D/g, "");
  let hasCnpjCpf = docDigits.length === 11 || docDigits.length === 14;

  const telefoneNum = posVenda.telefone.replace(/\D/g, "");

  // 1. Tenta buscar pelo campo personalizado (CPF_CNPJ)
  if (hasCnpjCpf) {
    try {
      const byDoc = await rdRequest<any[]>(
        "GET",
        `/contacts?filter=@cpf_cnpj:${encodeURIComponent(docDigits)}`
      );
      if (Array.isArray(byDoc) && byDoc.length > 0) {
        const existingId = byDoc[0].id;
        console.log(`[RD CRM] Contato existente (por doc): ${existingId}`);
        // Atualiza organização e email se estiverem faltando
        const needsEmailUpdate = posVenda.email && (!byDoc[0].emails || byDoc[0].emails.length === 0);
        const needsOrgUpdate = organizationId && !byDoc[0].organization_id;
        if (needsEmailUpdate || needsOrgUpdate) {
          const updatePayload: Record<string, any> = {};
          if (needsEmailUpdate) updatePayload.emails = [{ email: posVenda.email!.trim().toLowerCase() }];
          if (needsOrgUpdate) updatePayload.organization_id = organizationId;
          try {
            await rdRequest("PUT", `/contacts/${existingId}`, updatePayload);
            console.log(`[RD CRM] Contato ${existingId} atualizado (email/empresa).`);
          } catch (e: any) { console.warn(`[RD CRM] Falha ao atualizar contato ${existingId}:`, e.message); }
        }
        return existingId;
      }
    } catch {}
  }

  // 2. Tenta buscar pelo telefone
  try {
    const byPhone = await rdRequest<any[]>("GET", `/contacts?filter=phone:${telefoneNum}`);
    if (Array.isArray(byPhone) && byPhone.length > 0) {
      const existingId = byPhone[0].id;
      console.log(`[RD CRM] Contato existente (por telefone): ${existingId}`);
      // Atualiza email se estiver faltando no contato existente
      const needsEmailUpdate = posVenda.email && (!byPhone[0].emails || byPhone[0].emails.length === 0);
      const needsOrgUpdate = organizationId && !byPhone[0].organization_id;
      if (needsEmailUpdate || needsOrgUpdate) {
        const updatePayload: Record<string, any> = {};
        if (needsEmailUpdate) updatePayload.emails = [{ email: posVenda.email!.trim().toLowerCase() }];
        if (needsOrgUpdate) updatePayload.organization_id = organizationId;
        try {
          await rdRequest("PUT", `/contacts/${existingId}`, updatePayload);
          console.log(`[RD CRM] Contato ${existingId} atualizado (email/empresa).`);
        } catch (e: any) { console.warn(`[RD CRM] Falha ao atualizar contato:`, e.message); }
      }
      return existingId;
    }
  } catch {}

  // 3. Cria contato novo
  const contactPayload: Record<string, any> = {
    name:        posVenda.nome,
    phones:      [{ phone: telefoneNum }],
  };

  if (posVenda.email) {
    const emailSanitized = posVenda.email.trim().toLowerCase();
    contactPayload.emails = [{ email: emailSanitized }];
  }
  if (posVenda.cnpjCpf) {
    contactPayload.custom_fields = {
      cpf_cnpj: docDigits
    };
  }
  
  if (organizationId) {
    contactPayload.organization_id = organizationId;
    contactPayload.company_id = organizationId;
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
): Promise<{ dealId: string; ownerId: string }> {
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

  // Monta payload APENAS com campos documentados na API v2
  // Ref: POST /crm/v2/deals — campos aceitos: name, pipeline_id, stage_id, owner_id,
  //      contact_ids, status, rating, source_id, campaign_id, organization_id, custom_fields
  const dealPayload: Record<string, any> = {
    name:        titulo,
    pipeline_id: pipelineId,
    stage_id:    stageId,
    owner_id:    ownerId,
    contact_ids: [contactId],
    status:      "ongoing",
    rating:      1,
  };

  // source_id — campo correto conforme documentação (não é deal_source_id)
  if (sourceId)      dealPayload.source_id      = sourceId;
  if (campaignId)    dealPayload.campaign_id    = campaignId;
  if (organizationId) {
    dealPayload.organization_id = organizationId;
    console.log(`[RD CRM] Vinculando empresa ${organizationId} à negociação`);
  }

  // custom_fields — objeto simples conforme API v2 (slug: valor)
  const cfs = await loadDealCustomFields();
  const infoField = cfs.find((f: any) => f.name.includes("complementar") || f.slug.includes("complementar"));

  const customFieldsObj: Record<string, any> = {};
  if (infoField && infoField.id) {
    // Usa o UUID do campo como chave (formato aceito pela API v2)
    customFieldsObj[infoField.id] = infoCompl;
    console.log(`[RD CRM] Info. complementares no campo ${infoField.id} (${infoField.name})`);
  } else {
    // Fallback: slug genérico
    customFieldsObj["informacoes_complementares"] = infoCompl;
    console.warn(`[RD CRM] Campo 'complementar' não encontrado nos custom fields. Usando slug genérico.`);
  }
  dealPayload.custom_fields = customFieldsObj;

  const deal = await rdRequest<{ id: string }>("POST", "/deals", dealPayload);
  console.log(`[RD CRM] Negociação criada: ${deal.id} — "${titulo}"`);
  return { dealId: deal.id, ownerId };
}

// ─── Anotações ───────────────────────────────────────────────────────────────
/**
 * Cria uma anotação com o relatório completo do Fagner na negociação.
 */
async function createNote(dealId: string, relatorio: string): Promise<void> {
  await rdRequest("POST", `/deals/${dealId}/notes`, { description: relatorio });
  console.log(`[RD CRM] Anotação criada na negociação ${dealId}`);
}

// ─── Tarefa de Ligação Imediata ───────────────────────────────────────────────
/**
 * Cria uma tarefa do tipo "Ligação" associada ao deal recém-criado,
 * atribuída ao mesmo operador (owner) da negociação.
 *
 * - type: "call" — Ligação (conforme enum da API v2)
 * - due_date: momento exato da criação (ISO 8601 UTC)
 * - status: "open" (default — tarefas só podem ser criadas como abertas)
 * - owner_ids: array com o ID do operador alocado ao deal
 *
 * Executada com try/catch isolado para não bloquear o fluxo principal
 * caso a tarefa falhe (rate limit, rede, etc).
 */
async function createCallTask(
  dealId: string,
  ownerId: string,
  clienteNome: string,
  clienteTelefone: string,
  funil: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await rdRequest("POST", "/tasks", {
      name: "⚡ Ligar para o cliente agora",
      type: "call",
      deal_id: dealId,
      owner_ids: [ownerId],
      due_date: now,
      description:
        `Fagner IA gerou este lead — Funil: ${funil}\n` +
        `Cliente: ${clienteNome} | Tel: ${clienteTelefone}\n` +
        `Entre em contato IMEDIATAMENTE para não perder a oportunidade.`,
    });
    console.log(`[RD CRM] ✅ Tarefa de ligação criada → deal ${dealId} | owner: ${ownerId} | funil: ${funil}`);
  } catch (e: any) {
    // Não bloqueia o fluxo principal — deal já foi criado com sucesso
    // Usa console.ERROR para garantir visibilidade nos logs do Railway
    console.error(`[RD CRM] ❌ FALHA NA TAREFA — deal=${dealId} owner=${ownerId} funil=${funil}`);
    console.error(`[RD CRM] ❌ Erro completo: ${e.message}`);
  }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function createPosVendaOS(
  visitorId: string,
  posVendaData: Omit<PosVendaData, 'conversationSnippet'> & { conversationSummary?: string },
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

  // 1. Empresa — para CNPJ: usa dados da Receita. Para CPF: cria com nome do cliente.
  let organizationId: string | null = null;
  const docDigits = (posVendaData.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = docDigits.length === 14;
  const isCpf  = docDigits.length === 11;

  if (isCnpj && posVendaData.cnpjData) {
    // CNPJ com dados da Receita disponíveis
    organizationId = await findOrCreateOrganization(posVendaData as PosVendaData);
  } else if (isCpf) {
    // CPF: cria empresa com o nome do cliente
    organizationId = await findOrCreateOrganization(posVendaData as PosVendaData);
  }

  // 2. Contato (cria ou busca, e atualiza e-mail se necessário)
  const contactId = await upsertContact(posVendaData as PosVendaData, organizationId);

  // 3. Negociação
  const { dealId, ownerId: resolvedOwner } = await createDeal(posVendaData as PosVendaData, contactId, organizationId);

  // 4. Anotação com relatório completo
  await createNote(dealId, relatorio);

  // 5. Tarefa de ligação imediata — usa o MESMO owner já resolvido no deal
  if (resolvedOwner) {
    await createCallTask(dealId, resolvedOwner, posVendaData.nome, posVendaData.telefone, "Pós Venda");
  } else {
    console.warn("[RD CRM] Pós Venda: sem owner — tarefa de ligação não criada.");
  }

  // 6. Persistir o dealId no visitante
  await db.update(lcVisitors)
    .set({ rdCrmDealId: dealId })
    .where(eq(lcVisitors.id, visitorId));

  console.log(`[RD CRM] ✅ OS criada com sucesso! Deal ID: ${dealId}`);
  return dealId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÁQUINAS — Criação de Deal no funil MÁQUINAS 2.0
// ═══════════════════════════════════════════════════════════════════════════════

const RD_MAQUINAS_PIPELINE_ID    = "69cacc81e9770f001324bb44";
const RD_MAQUINAS_FIRST_STAGE_ID = "69cacc81e9770f001324bb47"; // LEADS RECEBIDOS

// NOTA: loadMaquinasCustomFields foi removida — usa loadDealCustomFields que já funciona
// rota correta: /deals/custom_fields (não /deal_custom_fields)

/**
 * Cria uma negociação no funil MÁQUINAS 2.0 do RD CRM.
 * Título: "FAGNER | NOME DO CLIENTE"
 * Campos personalizados: CLIENTE NOVO?, QUALIFICADO POR SDR, QUAL O PRODUTO FABRICADO?, VOLUME DE PRODUÇÃO?
 */
async function createMaquinasDeal(
  maqData: MaquinasData,
  contactId: string,
  organizationId?: string | null
): Promise<{ dealId: string; ownerId: string }> {
  const titulo = `FAGNER | ${maqData.nome}`;

  let infoCompl: string;
  if (maqData.conversationSummary) {
    infoCompl = maqData.conversationSummary;
  } else {
    const partes: string[] = [`Máquina: ${maqData.maquinaDesejada}`];
    if (maqData.detalhes)        partes.push(`Detalhes: ${maqData.detalhes}`);
    if (maqData.produtoFabricado) partes.push(`Produto: ${maqData.produtoFabricado}`);
    infoCompl = partes.join(' | ');
  }

  const pipelineId = RD_MAQUINAS_PIPELINE_ID;
  const stageId    = RD_MAQUINAS_FIRST_STAGE_ID;
  const ownerId    = (maqData.ownerId || (process.env.RD_CRM_OWNER_MAQUINAS_ID ?? '')).trim();

  if (!ownerId) {
    console.warn('[RD CRM] Owner ID para máquinas não configurado — deal sem responsável definido');
  }

  const [sourceId, campaignId] = await Promise.all([getOrCreateSourceId(), getOrCreateCampaignId()]);

  console.log(`[RD CRM] Criando deal MÁQUINAS "${titulo}": pipeline=${pipelineId} stage=${stageId} owner=${ownerId}`);

  const dealPayload: Record<string, any> = {
    name:        titulo,
    pipeline_id: pipelineId,
    stage_id:    stageId,
    contact_ids: [contactId],
    status:      'ongoing',
    rating:      3,
  };

  if (ownerId)    dealPayload.owner_id       = ownerId;
  if (sourceId)   dealPayload.source_id      = sourceId;   // campo correto (não é deal_source_id)
  if (campaignId) dealPayload.campaign_id    = campaignId;
  if (organizationId) {
    dealPayload.organization_id = organizationId;
    console.log(`[RD CRM] Vinculando empresa ${organizationId} à negociação de máquinas`);
  }

  // ── Campos personalizados via SLUG (formato oficial API v2) ─────────────────
  // Endpoint: GET /custom_fields?filter=entity:deal
  // Formato no deal: custom_fields: { "slug_do_campo": "valor" }
  const cfs = await loadDealCustomFields() as any[];
  console.log(`[RD CRM] Custom fields disponíveis (${cfs.length}):`,
    cfs.map((f: any) => `${f.name}(slug:${f.slug})`).join(' | '));

  const findF = (partial: string): any =>
    cfs.find((f: any) =>
      f.name.includes(partial.toLowerCase()) ||
      f.slug.includes(partial.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
    );

  const fClienteNovo = findF('cliente novo');
  const fSdr         = findF('qualificado por sdr') || findF('qualificado');
  const fProduto     = findF('produto fabricado')   || findF('produto');
  const fVolume      = findF('volume de produ')      || findF('volume');
  const fInfo        = findF('complementar');

  console.log('[RD CRM] Slugs mapeados:', {
    clienteNovo:  fClienteNovo?.slug ?? 'NÃO ENCONTRADO',
    sdr:          fSdr?.slug         ?? 'NÃO ENCONTRADO',
    produto:      fProduto?.slug     ?? 'NÃO ENCONTRADO',
    volume:       fVolume?.slug      ?? 'NÃO ENCONTRADO',
    complementar: fInfo?.slug        ?? 'NÃO ENCONTRADO',
  });

  dealPayload.custom_fields = {};

  // USA UUID DO CAMPO como chave (formato da API v2) — slug causa 422 'Deal custom fields Não é válido'
  if (fClienteNovo?.id && maqData.clienteNovo)
    dealPayload.custom_fields[fClienteNovo.id] = maqData.clienteNovo.toUpperCase();

  const SDR_OPTIONS: Record<string, string> = {
    '1': 'Decisor com Pressa (Falou com quem manda e ele quer solução rápida)',
    '2': 'Planejando Investimento (Interesse real, mas sem data definida)',
    '3': 'Troca de Máquina (Já tem o processo e quer apenas renovar)',
    '4': 'Curioso / Estudante (Não é empresa ou não tem intenção de compra)',
    '5': 'Fora de Portfólio (Quer algo que a Tecfag não fabrica)',
    '6': 'Sumiu / Sem contato (Não atendeu ou não retornou)',
  };
  if (fSdr?.id && maqData.qualificacaoSDR)
    dealPayload.custom_fields[fSdr.id] = SDR_OPTIONS[maqData.qualificacaoSDR] ?? SDR_OPTIONS['2'];

  if (fProduto?.id && maqData.produtoFabricado)
    dealPayload.custom_fields[fProduto.id] = maqData.produtoFabricado;

  if (fVolume?.id && maqData.volumeProducao)
    dealPayload.custom_fields[fVolume.id] = maqData.volumeProducao;

  if (fInfo?.id)
    dealPayload.custom_fields[fInfo.id] = infoCompl;

  // Se nenhum campo personalizado foi encontrado, nao envia custom_fields (evita 422)
  if (Object.keys(dealPayload.custom_fields).length === 0) {
    delete dealPayload.custom_fields;
    console.warn('[RD CRM] Nenhum campo personalizado de deal encontrado — custom_fields omitido');
  } else {
    console.log('[RD CRM] custom_fields (por UUID) a enviar:', JSON.stringify(dealPayload.custom_fields));
  }

  const deal = await rdRequest<{ id: string }>('POST', '/deals', dealPayload);
  console.log(`[RD CRM] Negociação MÁQUINAS criada: ${deal.id} — "${titulo}"`);
  return { dealId: deal.id, ownerId };
}


// ─── Função principal para MÁQUINAS ──────────────────────────────────────────
export async function createMaquinasOS(
  visitorId: string,
  maqData: MaquinasData,
  relatorio: string
): Promise<string> {
  if (!process.env.RD_CRM_CLIENT_ID) {
    throw new Error("[RD CRM] Variáveis de ambiente RD CRM não configuradas.");
  }

  const [visitor] = await db.select({ rdCrmDealId: lcVisitors.rdCrmDealId })
    .from(lcVisitors)
    .where(eq(lcVisitors.id, visitorId));

  // Não bloqueia se já tem deal — máquinas pode ter múltiplos deals (diferentes orçamentos)
  // MAS se o último deal é recente (< 1h), pula para evitar duplicação
  if (visitor?.rdCrmDealId) {
    console.log(`[RD CRM] Visitante ${visitorId} já tem deal: ${visitor.rdCrmDealId}. Criando novo deal de máquinas.`);
  }

  console.log(`[RD CRM] Criando deal MÁQUINAS para visitante ${visitorId}...`);

  // FIX #2: empresa sempre criada — com CNPJ/CPF se disponível, com nome do cliente como fallback
  let organizationId: string | null = null;
  const docDigits = (maqData.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = docDigits.length === 14;
  const isCpf  = docDigits.length === 11;

  try {
    if (isCnpj || isCpf) {
      organizationId = await findOrCreateOrganization(maqData as any);
      console.log(`[RD CRM] MÁQUINAS: empresa ${organizationId ? 'encontrada/criada: ' + organizationId : 'não criada'}`);
    } else {
      // Sem CNPJ/CPF: cria empresa apenas pelo nome (evita negociacao sem empresa)
      console.log(`[RD CRM] MÁQUINAS: CNPJ/CPF ausente, criando empresa pelo nome: "${maqData.nome}"`);
      try {
        const byName = await rdRequest<any[]>('GET', `/organizations?filter=name:${encodeURIComponent(maqData.nome)}`);
        if (Array.isArray(byName) && byName.length > 0) {
          organizationId = byName[0].id;
          console.log(`[RD CRM] MÁQUINAS: empresa existente pelo nome: ${organizationId}`);
        } else {
          const org = await rdRequest<{ id: string }>('POST', '/organizations', { name: maqData.nome });
          organizationId = org.id;
          console.log(`[RD CRM] MÁQUINAS: empresa criada pelo nome: ${organizationId} — "${maqData.nome}"`);
        }
      } catch (orgErr: any) {
        console.warn('[RD CRM] MÁQUINAS: falha ao criar empresa pelo nome:', orgErr.message);
      }
    }
  } catch (e: any) {
    console.warn('[RD CRM] MÁQUINAS: falha ao criar empresa —', e.message);
  }

  // 2. Contato
  const contactId = await upsertContact(maqData as any, organizationId);

  // 3. Negociação no funil MÁQUINAS 2.0
  const { dealId, ownerId: resolvedOwner } = await createMaquinasDeal(maqData, contactId, organizationId);

  // 4. Anotação com relatório completo
  await createNote(dealId, relatorio);

  // 5. Tarefa de ligação imediata — usa o MESMO owner já resolvido no deal
  if (resolvedOwner) {
    await createCallTask(dealId, resolvedOwner, maqData.nome, maqData.telefone, "Máquinas 2.0");
  } else {
    console.warn("[RD CRM] Máquinas: sem owner — tarefa de ligação não criada.");
  }

  // 6. Persistir dealId
  await db.update(lcVisitors)
    .set({ rdCrmDealId: dealId })
    .where(eq(lcVisitors.id, visitorId));

  console.log(`[RD CRM] ✅ Deal MÁQUINAS criado! ID: ${dealId}`);
  return dealId;
}

/**
 * Verifica se o ambiente RD CRM está corretamente configurado.
 */
export function isRdCrmConfigured(): boolean {
  return !!(
    process.env.RD_CRM_CLIENT_ID &&
    process.env.RD_CRM_CLIENT_SECRET &&
    (process.env.RD_CRM_ACCESS_TOKEN || process.env.RD_CRM_REFRESH_TOKEN)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PEÇAS — Criação de Deal no funil FUNIL PEÇAS 2.0
// ═══════════════════════════════════════════════════════════════════════════════

export interface PecasData {
  nome: string;
  telefone: string;
  email?: string | null;
  cnpjCpf?: string | null;
  cnpjData?: CnpjData | null;
  pecaDesejada: string;                 // descrição da peça que o cliente quer
  eCliente?: string | null;             // SIM / NAO / NÃO INFORMADO
  conversationSummary?: string | null;
  ownerId?: string | null;              // vem do painel Settings (rodízio)
}

// Cache de IDs do funil PEÇAS (buscados dinamicamente pelo nome)
let _pecasPipelineId: string | null = null;
let _pecasFirstStageId: string | null = null;

/**
 * Busca dinamicamente os IDs do funil "FUNIL PEÇAS 2.0" no RD CRM.
 * Usa env vars como override, e recorre à busca por nome como fallback.
 */
async function getPecasPipelineIds(): Promise<{ pipelineId: string; stageId: string }> {
  // Override via env vars (preferido)
  const envPipeline = process.env.RD_CRM_PIPELINE_PECAS_ID;
  const envStage    = process.env.RD_CRM_PIPELINE_PECAS_STAGE_ID;
  if (envPipeline && envStage) {
    console.log(`[RD CRM] PEÇAS: usando IDs de env vars (pipeline=${envPipeline}, stage=${envStage})`);
    return { pipelineId: envPipeline, stageId: envStage };
  }

  // Cache em memória
  if (_pecasPipelineId && _pecasFirstStageId) {
    return { pipelineId: _pecasPipelineId, stageId: _pecasFirstStageId };
  }

  // Busca dinâmica pelo nome do funil
  try {
    const FUNIL_NAME = 'FUNIL PEÇAS 2.0';
    const pipelines = await rdRequest<any>('GET', '/pipelines?page[size]=50');
    const list: any[] = Array.isArray(pipelines) ? pipelines : (Array.isArray(pipelines?.data) ? pipelines.data : []);
    console.log(`[RD CRM] Pipelines disponíveis:`, list.map((p: any) => `${p.name}(${p.id})`).join(' | '));

    const found = list.find((p: any) =>
      p.name?.toLowerCase().includes('peça') ||
      p.name?.toLowerCase().includes('peca') ||
      p.name === FUNIL_NAME
    );

    if (found) {
      _pecasPipelineId = found.id;
      // Pega o primeiro stage do pipeline
      try {
        const stages = await rdRequest<any>(`GET`, `/pipelines/${found.id}/stages?page[size]=50`);
        const stageList: any[] = Array.isArray(stages) ? stages : (Array.isArray(stages?.data) ? stages.data : []);
        if (stageList.length > 0) {
          _pecasFirstStageId = stageList[0].id;
          console.log(`[RD CRM] PEÇAS: pipeline="${found.name}" id=${found.id}, primeira stage="${stageList[0].name}" id=${stageList[0].id}`);
        }
      } catch (stageErr: any) {
        console.warn('[RD CRM] PEÇAS: falha ao buscar stages do pipeline:', stageErr.message);
      }
    } else {
      console.warn(`[RD CRM] PEÇAS: funil "${FUNIL_NAME}" não encontrado. Configure RD_CRM_PIPELINE_PECAS_ID.`);
    }
  } catch (e: any) {
    console.warn('[RD CRM] PEÇAS: falha ao buscar pipelines:', e.message);
  }

  if (!_pecasPipelineId || !_pecasFirstStageId) {
    throw new Error(
      '[RD CRM] PEÇAS: não foi possível encontrar o funil "FUNIL PEÇAS 2.0". ' +
      'Configure RD_CRM_PIPELINE_PECAS_ID e RD_CRM_PIPELINE_PECAS_STAGE_ID no Railway.'
    );
  }

  return { pipelineId: _pecasPipelineId, stageId: _pecasFirstStageId };
}

/**
 * Cria um deal no funil PEÇAS 2.0.
 * Sem campos personalizados específicos além de "Informações Complementares".
 * Título: "FAGNER | NOME DO CLIENTE"
 */
async function createPecasDeal(
  pecasData: PecasData,
  contactId: string,
  organizationId?: string | null
): Promise<{ dealId: string; ownerId: string }> {
  const titulo = `FAGNER | ${pecasData.nome}`;

  const infoCompl = pecasData.conversationSummary
    ?? `Peça: ${pecasData.pecaDesejada}${pecasData.eCliente ? ` | É cliente: ${pecasData.eCliente}` : ''}`.trim();

  const { pipelineId, stageId } = await getPecasPipelineIds();
  const ownerId = (pecasData.ownerId || (process.env.RD_CRM_OWNER_PECAS_ID ?? '')).trim();

  if (!ownerId) {
    console.warn('[RD CRM] Owner ID para peças não configurado — deal sem responsável definido');
  }

  const [sourceId, campaignId] = await Promise.all([getOrCreateSourceId(), getOrCreateCampaignId()]);

  console.log(`[RD CRM] Criando deal PEÇAS "${titulo}": pipeline=${pipelineId} stage=${stageId} owner=${ownerId}`);

  const dealPayload: Record<string, any> = {
    name:        titulo,
    pipeline_id: pipelineId,
    stage_id:    stageId,
    contact_ids: [contactId],
    status:      'ongoing',
    rating:      2,   // interesse médio
  };

  if (ownerId)        dealPayload.owner_id       = ownerId;
  if (sourceId)       dealPayload.source_id      = sourceId;   // campo correto (não é deal_source_id)
  if (campaignId)     dealPayload.campaign_id    = campaignId;
  if (organizationId) dealPayload.organization_id = organizationId;

  // Campo "Informações Complementares" via slug (mesmo padrão do pos_venda/maquinas)
  const cfs = await loadDealCustomFields() as any[];
  const findF = (partial: string): any =>
    cfs.find((f: any) =>
      f.name.includes(partial.toLowerCase()) ||
      f.slug.includes(partial.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
    );
  const fInfo = findF('complementar');

  dealPayload.custom_fields = {};
  // USA UUID DO CAMPO como chave (formato da API v2) — slug causa 422
  if (fInfo?.id) {
    dealPayload.custom_fields[fInfo.id] = infoCompl;
  }

  // Se nenhum campo encontrado, omite custom_fields para evitar 422
  if (Object.keys(dealPayload.custom_fields).length === 0) {
    delete dealPayload.custom_fields;
    console.warn('[RD CRM] PEÇAS: campo complementar não encontrado — custom_fields omitido');
  } else {
    console.log('[RD CRM] PEÇAS custom_fields (UUID):', JSON.stringify(dealPayload.custom_fields));
  }

  const deal = await rdRequest<{ id: string }>('POST', '/deals', dealPayload);
  console.log(`[RD CRM] Negociação PEÇAS criada: ${deal.id} — "${titulo}"`);
  return { dealId: deal.id, ownerId };
}

/**
 * Função principal: cria OS completa (Empresa → Contato → Deal → Anotação) no funil PEÇAS 2.0.
 */
export async function createPecasOS(
  visitorId: string,
  pecasData: PecasData,
  relatorio: string
): Promise<string> {
  if (!process.env.RD_CRM_CLIENT_ID) {
    throw new Error('[RD CRM] Variáveis de ambiente RD CRM não configuradas.');
  }

  const [visitor] = await db.select({ rdCrmDealId: lcVisitors.rdCrmDealId })
    .from(lcVisitors)
    .where(eq(lcVisitors.id, visitorId));

  if (visitor?.rdCrmDealId) {
    console.log(`[RD CRM] PEÇAS: visitante ${visitorId} já tem deal: ${visitor.rdCrmDealId}. Criando novo deal de peças.`);
  }

  console.log(`[RD CRM] Criando deal PEÇAS para visitante ${visitorId}...`);

  // FIX #2: empresa sempre criada — com CNPJ/CPF se disponível, com nome do cliente como fallback
  let organizationId: string | null = null;
  const docDigits = (pecasData.cnpjCpf ?? '').replace(/\D/g, '');

  try {
    if (docDigits.length === 14 || docDigits.length === 11) {
      organizationId = await findOrCreateOrganization(pecasData as any);
    } else {
      // Sem CNPJ/CPF: cria empresa pelo nome do cliente
      console.log(`[RD CRM] PEÇAS: CNPJ/CPF ausente, criando empresa pelo nome: "${pecasData.nome}"`);
      try {
        const byName = await rdRequest<any[]>('GET', `/organizations?filter=name:${encodeURIComponent(pecasData.nome)}`);
        if (Array.isArray(byName) && byName.length > 0) {
          organizationId = byName[0].id;
          console.log(`[RD CRM] PEÇAS: empresa existente pelo nome: ${organizationId}`);
        } else {
          const org = await rdRequest<{ id: string }>('POST', '/organizations', { name: pecasData.nome });
          organizationId = org.id;
          console.log(`[RD CRM] PEÇAS: empresa criada pelo nome: ${organizationId} — "${pecasData.nome}"`);
        }
      } catch (orgErr: any) {
        console.warn('[RD CRM] PEÇAS: falha ao criar empresa pelo nome:', orgErr.message);
      }
    }
  } catch (e: any) {
    console.warn('[RD CRM] PEÇAS: falha ao criar empresa —', e.message);
  }

  // 2. Contato
  const contactId = await upsertContact(pecasData as any, organizationId);

  // 3. Deal no funil PEÇAS 2.0
  const { dealId, ownerId: resolvedOwner } = await createPecasDeal(pecasData, contactId, organizationId);

  // 4. Anotação com relatório completo
  await createNote(dealId, relatorio);

  // 5. Tarefa de ligação imediata — usa o MESMO owner já resolvido no deal
  if (resolvedOwner) {
    await createCallTask(dealId, resolvedOwner, pecasData.nome, pecasData.telefone, "Peças 2.0");
  } else {
    console.warn("[RD CRM] Peças: sem owner — tarefa de ligação não criada.");
  }

  // 6. Persistir dealId no visitante
  await db.update(lcVisitors)
    .set({ rdCrmDealId: dealId })
    .where(eq(lcVisitors.id, visitorId));

  console.log(`[RD CRM] ✅ Deal PEÇAS criado com sucesso! ID: ${dealId}`);
  return dealId;
}

