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

// Cache dos campos personalizados de deal (resolve slugs dinamicamente)
interface DealCfInfo { id: string; name: string; slug: string; type?: string; options?: string[]; }
let _dealCfCache: DealCfInfo[] | null = null;
let _dealCfCacheLoadedAt = 0;

// Cache de fontes do RD CRM: Map<nomeDaFonte, idNoRDCRM>
let _sourcesCache: Map<string, string> | null = null;

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

// ─── Source / Campaign: resolução dinâmica baseada na origem do visitante ─────

/**
 * Carrega a lista completa de fontes do RD CRM uma única vez em memória
 * (cache Map<nome, id>). Fontes pré-existentes no CRM são preservadas;
 * novas fontes são criadas apenas como fallback de último recurso.
 */
async function loadSourcesCache(): Promise<Map<string, string>> {
  if (_sourcesCache && _sourcesCache.size > 0) return _sourcesCache;

  const map = new Map<string, string>();
  try {
    const allData = await rdRequest<any>("GET", "/sources?page[size]=200");
    const list: any[] = Array.isArray(allData) ? allData : [];
    for (const s of list) {
      if (s.name && s.id) map.set(s.name, s.id);
    }
    console.log(`[RD CRM] ✅ Fontes carregadas: ${map.size} opções disponíveis. Nomes: [${Array.from(map.keys()).join(' | ')}]`);
  } catch (e: any) {
    console.error('[RD CRM] ❌ Falha ao carregar fontes do CRM:', e.message);
  }
  _sourcesCache = map;
  return map;
}

/**
 * Retorna o ID da fonte pelo nome exato.
 * Se a fonte não existir no CRM, tenta o fallback "Referência | tecfag.com.br".
 * Como último recurso, cria a fonte solicitada (para não perder o dado).
 */
async function getSourceIdByName(sourceName: string): Promise<string> {
  const cache = await loadSourcesCache();

  // 1. Match exato
  if (cache.has(sourceName)) {
    const id = cache.get(sourceName)!;
    console.log(`[RD CRM] ✅ Fonte resolvida: "${sourceName}" → ${id}`);
    return id;
  }

  // 2. Fallback para a fonte padrão
  const fallbackName = "Referência | tecfag.com.br";
  if (cache.has(fallbackName)) {
    const id = cache.get(fallbackName)!;
    console.warn(`[RD CRM] ⚠️ Fonte "${sourceName}" não encontrada no CRM. Usando fallback: "${fallbackName}" → ${id}`);
    return id;
  }

  // 3. Último recurso: criar a fonte solicitada
  console.warn(`[RD CRM] ⚠️ Nem "${sourceName}" nem o fallback existem. Criando fonte...`);
  try {
    const nameToCreate = cache.size === 0 ? fallbackName : sourceName;
    const created = await rdRequest<{ id: string }>("POST", "/sources", { name: nameToCreate });
    if (created?.id) {
      cache.set(nameToCreate, created.id);
      console.log(`[RD CRM] ✅ Fonte criada: "${nameToCreate}" → ${created.id}`);
      return created.id;
    }
  } catch (e: any) {
    console.error('[RD CRM] ❌ Falha ao criar fonte:', e.message);
  }
  return '';
}

// ─── Nomes de fontes do RD CRM (devem corresponder EXATAMENTE às opções pré-definidas) ─
const SOURCE_NAMES = {
  BUSCA_PAGA_GOOGLE:    'Busca Paga | Google',
  BUSCA_PAGA_GOOGLEADS: 'Busca Paga | googleads',
  BUSCA_PAGA_META:      'Busca Paga | meta',
  BUSCA_PAGA_META_LINK: 'Busca Paga | meta-SiteLink',
  BUSCA_ORG_GOOGLE:     'Busca Orgânica | Google',
  BUSCA_ORG_BING:       'Busca Orgânica | Bing',
  BUSCA_ORG_YAHOO:      'Busca Orgânica | Yahoo',
  OUTROS_BUSCADORES:    'Google e Outros Buscadores',
  ORGANICO_TIKTOK:      'Orgânico | TikTok',
  FORMULARIO_VTEX:      'Formulário Vtex',
  EMAIL_MARKETING:      'E-mail Marketing',
  PARCEIROS:            'Indicação por Parceiros',
  CLIENTES:             'Indicação por Clientes',
  FEIRAS_EVENTOS:       'Feiras e Eventos',
  CONTATO_SITE:         'Contato pelo Site',
  LINKTREE:             'Linktree',
  DESCONHECIDO:         'Desconhecido',
  FALLBACK:             'Referência | tecfag.com.br',
} as const;

/**
 * Resolve o nome da fonte do RD CRM com base nos parâmetros UTM e referrer
 * do visitante, seguindo 16 regras de prioridade decrescente.
 *
 * @param utmSource   - Valor do parâmetro utm_source na URL de entrada
 * @param utmMedium   - Valor do parâmetro utm_medium na URL de entrada
 * @param utmCampaign - Valor do parâmetro utm_campaign na URL de entrada
 * @param referrer    - URL de referrer do browser (document.referrer)
 * @returns Nome exato da opção de fonte no RD Station CRM
 */
function resolveLeadSourceName(
  utmSource?: string | null,
  utmMedium?: string | null,
  utmCampaign?: string | null,
  referrer?: string | null
): string {
  const src  = (utmSource  ?? '').toLowerCase().trim();
  const med  = (utmMedium  ?? '').toLowerCase().trim();
  const camp = (utmCampaign ?? '').toLowerCase().trim();
  const ref  = (referrer   ?? '').toLowerCase().trim();

  console.log(`[RD CRM Fonte] Resolvendo origem — utmSource="${src}" utmMedium="${med}" utmCampaign="${camp}" referrer="${ref.slice(0, 60)}"`);

  // ── Regra 1: Google Ads (CPC) ─────────────────────────────────────────────
  // Identificado por utm_medium=cpc com utm_source=google,
  // ou pela presença do parâmetro automático gclid (Google Click ID)
  if ((src === 'google' && (med === 'cpc' || med === 'ppc')) ||
      ref.includes('gclid=') || src === 'google_ads') {
    return SOURCE_NAMES.BUSCA_PAGA_GOOGLE;
  }

  // ── Regra 2: Google Ads via utm_source=googleads ──────────────────────────
  if (src === 'googleads') {
    return SOURCE_NAMES.BUSCA_PAGA_GOOGLEADS;
  }

  // ── Regra 3: Meta Ads (Facebook/Instagram) com SiteLink ───────────────────
  // Verificar sitelink ANTES do match genérico de meta pago
  if (src === 'meta' && camp.includes('sitelink')) {
    return SOURCE_NAMES.BUSCA_PAGA_META_LINK;
  }

  // ── Regra 4: Meta Ads (Facebook/Instagram) CPC ou fbclid ─────────────────
  const isMetaSource = src === 'facebook' || src === 'instagram' || src === 'meta';
  const isMetaPaid   = med === 'cpc' || med === 'paid' || med === 'ppc';
  const hasFbclid    = ref.includes('fbclid=') || src.includes('fbclid');
  if ((isMetaSource && isMetaPaid) || hasFbclid) {
    return SOURCE_NAMES.BUSCA_PAGA_META;
  }

  // ── Regra 5: Google Orgânico ──────────────────────────────────────────────
  if ((src === 'google' && med === 'organic') ||
      (src === 'google' && !med) ||
      (ref.includes('google.com') && !src && med !== 'cpc')) {
    return SOURCE_NAMES.BUSCA_ORG_GOOGLE;
  }

  // ── Regra 6: Bing Orgânico ────────────────────────────────────────────────
  if (src === 'bing' ||
      (ref.includes('bing.com') && !src)) {
    return SOURCE_NAMES.BUSCA_ORG_BING;
  }

  // ── Regra 7: Yahoo Orgânico ───────────────────────────────────────────────
  if (src === 'yahoo' ||
      (ref.includes('yahoo.com') && !src)) {
    return SOURCE_NAMES.BUSCA_ORG_YAHOO;
  }

  // ── Regra 8: Outros buscadores ────────────────────────────────────────────
  const OTHER_SEARCH_ENGINES = ['duckduckgo.com', 'ecosia.org', 'baidu.com', 'ask.com', 'yandex.com', 'search.'];
  if (!src && ref && OTHER_SEARCH_ENGINES.some(engine => ref.includes(engine))) {
    return SOURCE_NAMES.OUTROS_BUSCADORES;
  }

  // ── Regra 9: TikTok Orgânico ─────────────────────────────────────────────
  if (src === 'tiktok' ||
      (ref.includes('tiktok.com') && !src)) {
    return SOURCE_NAMES.ORGANICO_TIKTOK;
  }

  // ── Regra 10: Formulário VTEX ─────────────────────────────────────────────
  // Identificado por referrer do domínio VTEX ou parâmetros de formulário VTEX
  if (ref.includes('vtexcommercestable.com') ||
      ref.includes('vtexcommercebeta.com') ||
      ref.includes('checkout.vtex') ||
      src === 'vtex' || src === 'vtex_form') {
    return SOURCE_NAMES.FORMULARIO_VTEX;
  }

  // ── Regra 11: E-mail Marketing ────────────────────────────────────────────
  if (src === 'newsletter' || med === 'email' ||
      src === 'email' || med === 'mailing') {
    return SOURCE_NAMES.EMAIL_MARKETING;
  }

  // ── Regra 12: Indicação por Parceiros ────────────────────────────────────
  if (src === 'parceiro' || src === 'partner' ||
      med === 'afiliado' || med === 'affiliate') {
    return SOURCE_NAMES.PARCEIROS;
  }

  // ── Regra 13: Indicação por Clientes ─────────────────────────────────────
  if (src === 'cliente' || src === 'customer' ||
      med === 'referral' || src === 'indicacao') {
    return SOURCE_NAMES.CLIENTES;
  }

  // ── Regra 14: Feiras e Eventos (QR Code / Material Impresso) ─────────────
  if (src === 'qrcode' || src === 'qr_code' ||
      camp.includes('feira') || camp.includes('evento') ||
      src === 'evento' || src === 'feira' || med === 'impresso') {
    return SOURCE_NAMES.FEIRAS_EVENTOS;
  }

  // ── Regra 15: Linktree ────────────────────────────────────────────────────
  if (src === 'linktree' || ref.includes('linktr.ee') || ref.includes('linktree')) {
    return SOURCE_NAMES.LINKTREE;
  }

  // ── Regra 16: Desconhecido — sem dados de origem identificáveis ───────────
  // Nenhum UTM + nenhum referrer reconhecível = acesso direto ou dark traffic
  if (!src && !ref) {
    return SOURCE_NAMES.DESCONHECIDO;
  }

  // ── Regra 17: Contato pelo Site (fallback para tudo que restou) ───────────
  // Ex: visitante que veio de um link interno, navegação direta ou fonte não mapeada
  return SOURCE_NAMES.CONTATO_SITE;
}

// Mantém compatibilidade com código legado que chama getOrCreateSourceId()
// Usa o fallback padrão quando não há contexto de visitante disponível.
async function getOrCreateSourceId(): Promise<string> {
  return getSourceIdByName(SOURCE_NAMES.FALLBACK);
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

    // ── Detecção com scoring para CNPJ/CPF ──────────────────────────────────
    // Problema real: "Codigo do cliente" (slug:cnpj) vem antes de "CNPJ ou CPF" (slug:cpf)
    // na lista da API. Sem scoring, o campo errado seria capturado primeiro.
    // Score 3 = nome contém CNPJ E CPF (ex: "CNPJ ou CPF")
    // Score 2 = nome contém CNPJ ou CPF
    // Score 1 = apenas o slug contém cnpj/cpf (ex: "Codigo do cliente" slug:cnpj)
    let bestCnpjField: any = null;
    let bestCnpjScore  = -1;

    for (const f of list) {
      const s = (f.slug || '').toLowerCase();
      const n = (f.name || '').toLowerCase();

      // CNPJ/CPF — scoring por nome
      let score = -1;
      if (n.includes('cnpj') && n.includes('cpf'))  score = 3; // "CNPJ ou CPF" — melhor match
      else if (n.includes('cnpj') || n.includes('cpf') || n.includes('documento')) score = 2;
      else if (s.includes('cnpj') || s.includes('cpf'))  score = 1; // só slug bate (ex: Codigo do cliente)

      if (score > bestCnpjScore) {
        bestCnpjScore  = score;
        bestCnpjField  = f;
      }

      // Cidade
      if (!ids.cidade && (s.includes('cidade') || s.includes('city') || s.includes('municipio') || n.includes('cidade') || n.includes('municipio'))) {
        ids.cidade = f.id;
        console.log(`[RD CRM] Campo Cidade org: id=${f.id} name="${f.name}"`);
      }
      // Bairro
      if (!ids.bairro && (s.includes('bairro') || s.includes('district') || n.includes('bairro') || n.includes('district'))) {
        ids.bairro = f.id;
        console.log(`[RD CRM] Campo Bairro org: id=${f.id} name="${f.name}"`);
      }
      // Estado
      if (!ids.estado && (s.includes('estado') || s.includes('state') || s === 'uf' || n.includes('estado') || n === 'uf')) {
        ids.estado = f.id;
        console.log(`[RD CRM] Campo Estado org: id=${f.id} name="${f.name}"`);
      }
    }

    if (bestCnpjField && bestCnpjScore >= 0) {
      ids.cnpjCpf = bestCnpjField.id;
      console.log(`[RD CRM] ✅ Campo CNPJ/CPF org: id=${bestCnpjField.id} name="${bestCnpjField.name}" slug=${bestCnpjField.slug} score=${bestCnpjScore}`);
    } else {
      console.warn(`[RD CRM] ⚠️ Campo CNPJ/CPF NÃO encontrado. Nomes: ${list.map((f: any) => f.name).join(', ')}`);
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
 * Busca ou cria uma empresa no RD CRM.
 * SEMPRE cria a empresa (com nome do cliente como fallback se sem razão social).
 * O CNPJ/CPF e outros campos são atualizados via PUT separado após a criaão
 * para evitar que erros de custom_fields bloqueiem a criaão da empresa.
 */
async function findOrCreateOrganization(
  posVenda: { nome: string; cnpjCpf?: string | null; cnpjData?: CnpjData | null },
  ownerId: string
): Promise<string | null> {
  const doc = (posVenda.cnpjCpf ?? '').replace(/\D/g, '');
  const isCnpj = doc.length === 14;

  // Nome da empresa: razao social (CNPJ) ou nome do cliente (CPF/sem doc)
  const nomeEmpresa = (isCnpj && posVenda.cnpjData?.nome)
    ? posVenda.cnpjData.nome
    : posVenda.nome;

  if (!nomeEmpresa?.trim()) {
    console.error('[RD CRM] ❌ findOrCreateOrganization: nome vazio — empresa não criada');
    return null;
  }

  console.log(`[RD CRM] findOrCreateOrganization: nome="${nomeEmpresa}" doc="${doc}"`);

  // ── 1. Busca empresa existente — SOMENTE por nome (query por CNPJ causa falsos positivos) ──

  // Estratégia A: busca pelo nome exato via query textual
  try {
    const byQuery = await rdRequest<any>('GET', `/organizations?query=${encodeURIComponent(nomeEmpresa)}&page[size]=10`);
    const qList: any[] = Array.isArray(byQuery) ? byQuery : (Array.isArray(byQuery?.data) ? byQuery.data : []);
    const qMatch = qList.find((o: any) => o.name.toLowerCase() === nomeEmpresa.toLowerCase());
    if (qMatch) {
      console.log(`[RD CRM] \u2705 Empresa existente (busca por nome): ${qMatch.id} "${qMatch.name}"`);
      // Atualiza nome correto e CNPJ na empresa encontrada (corrige dados errados)
      await updateOrgWithData(qMatch.id, nomeEmpresa, doc, posVenda.cnpjData ?? null);
      return qMatch.id;
    }
  } catch { /* ignora — vai tentar criar */ }

  // Estratégia B: varredura ampla (page[size]=200) para lista completa
  try {
    const allRes = await rdRequest<any>('GET', `/organizations?page[size]=200`);
    const allList: any[] = Array.isArray(allRes) ? allRes : (Array.isArray(allRes?.data) ? allRes.data : []);
    const allMatch = allList.find((o: any) => o.name.toLowerCase() === nomeEmpresa.toLowerCase());
    if (allMatch) {
      console.log(`[RD CRM] \u2705 Empresa existente (varredura): ${allMatch.id} "${allMatch.name}"`);
      await updateOrgWithData(allMatch.id, nomeEmpresa, doc, posVenda.cnpjData ?? null);
      return allMatch.id;
    }
  } catch { /* ignora — vai criar */ }

  // ── 2. Cria empresa passando owner e custom_fields obrigatórios ─────────
  let orgId: string | null = null;
  const fieldIds = await loadOrgFieldIds();
  
  try {
    const createPayload: Record<string, any> = { name: nomeEmpresa, user_id: ownerId, owner_id: ownerId };
    if (posVenda.cnpjData?.telefone1) createPayload.phone = posVenda.cnpjData.telefone1;

    // Constrói custom_fields usando SLUGS (O RD CRM API v2 exige slugs, não ObjectIds!)
    const customFields: Record<string, string> = {};
    if (doc) customFields["cpf"] = doc; // A API indicou explicitamente slug "cpf" no erro
    if (posVenda.cnpjData?.municipio) customFields["cidade"] = posVenda.cnpjData.municipio;
    if (posVenda.cnpjData?.bairro)    customFields["bairro"] = posVenda.cnpjData.bairro;
    if (posVenda.cnpjData?.uf)        customFields["estado"] = posVenda.cnpjData.uf;

    if (Object.keys(customFields).length > 0) {
      createPayload.custom_fields = customFields;
    }

    console.log(`[RD CRM] Criando empresa: ${JSON.stringify(createPayload)}`);
    const org = await rdRequest<{ id: string }>('POST', '/organizations', createPayload);
    if (!org?.id) {
      console.error(`[RD CRM] ❌ POST /organizations retornou sem id: ${JSON.stringify(org)}`);
      return null;
    }
    orgId = org.id;
    console.log(`[RD CRM] \u2705 Empresa criada: ${orgId} — "${nomeEmpresa}"`);
  } catch (createErr: any) {
    console.error(`[RD CRM] ❌ FALHA CRIAR EMPRESA "${nomeEmpresa}": ${createErr.message}`);
    // Fallback: empresa já existe com esse nome — busca para vincular e atualizar
    if (createErr.message.includes("Nome Empresa já cadastrada")) {
      try {
        console.log(`[RD CRM] Fallback: buscando empresa já cadastrada por nome...`);
        const qRes = await rdRequest<any>('GET', `/organizations?query=${encodeURIComponent(nomeEmpresa)}&page[size]=10`);
        const qList: any[] = Array.isArray(qRes) ? qRes : (Array.isArray(qRes?.data) ? qRes.data : []);
        const qMatch = qList.find((o: any) => o.name.toLowerCase() === nomeEmpresa.toLowerCase());
        if (qMatch) {
          console.log(`[RD CRM] \u2705 Empresa resgatada (fallback query): ${qMatch.id} "${qMatch.name}"`);
          await updateOrgWithData(qMatch.id, nomeEmpresa, doc, posVenda.cnpjData ?? null);
          return qMatch.id;
        }
        // Varredura ampla
        const allRes = await rdRequest<any>('GET', `/organizations?page[size]=200`);
        const allList: any[] = Array.isArray(allRes) ? allRes : (Array.isArray(allRes?.data) ? allRes.data : []);
        const orgMatch = allList.find((o: any) => o.name.toLowerCase() === nomeEmpresa.toLowerCase());
        if (orgMatch) {
          console.log(`[RD CRM] \u2705 Empresa resgatada (fallback varredura): ${orgMatch.id} "${orgMatch.name}"`);
          await updateOrgWithData(orgMatch.id, nomeEmpresa, doc, posVenda.cnpjData ?? null);
          return orgMatch.id;
        }
        console.warn(`[RD CRM] \u26a0\ufe0f Empresa não localizada nos fallbacks.`);
      } catch (e: any) { console.error(`[RD CRM] Fallback org falhou: ${e.message}`); }
    }
    return null;
  }

  return orgId;
}

/**
 * Atualiza nome e campos personalizados de uma empresa existente via PUT.
 * Chamada sempre que encontramos empresa já cadastrada para garantir
 * que nome e CNPJ/CPF estejam corretos (corrige dados desatualizados).
 */
async function updateOrgWithData(
  orgId: string,
  nomeEmpresa: string,
  doc: string,
  cnpjData: CnpjData | null
): Promise<void> {
  try {
    const updatePayload: Record<string, any> = { name: nomeEmpresa };
    const customFields: Record<string, string> = {};
    if (doc) customFields["cpf"] = doc;
    if (cnpjData?.municipio) customFields["cidade"] = cnpjData.municipio;
    if (cnpjData?.bairro)    customFields["bairro"] = cnpjData.bairro;
    if (cnpjData?.uf)        customFields["estado"] = cnpjData.uf;
    if (Object.keys(customFields).length > 0) updatePayload.custom_fields = customFields;
    await rdRequest('PUT', `/organizations/${orgId}`, updatePayload);
    console.log(`[RD CRM] \u2705 Empresa ${orgId} atualizada: nome="${nomeEmpresa}" | CNPJ/CPF=${doc || 'N/A'}`);
  } catch (e: any) {
    console.warn(`[RD CRM] \u26a0\ufe0f Falha ao atualizar empresa ${orgId}: ${e.message}`);
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
        // FIX: sempre sobrescreve email, nome e organização quando o cliente informou novos dados
        const existingEmail = byDoc[0].emails?.[0]?.email ?? '';
        const existingName  = (byDoc[0].name ?? '').toLowerCase().trim();
        const newEmail = posVenda.email?.trim().toLowerCase() ?? '';
        const newName  = posVenda.nome?.trim().toLowerCase() ?? '';
        const needsEmailUpdate = newEmail && newEmail !== existingEmail;
        const needsNameUpdate  = newName  && newName  !== existingName;
        const needsOrgUpdate   = organizationId && !byDoc[0].organization_id;
        if (needsEmailUpdate || needsNameUpdate || needsOrgUpdate) {
          const updatePayload: Record<string, any> = {};
          if (needsEmailUpdate) updatePayload.emails          = [{ email: newEmail }];
          if (needsNameUpdate)  updatePayload.name             = posVenda.nome;
          if (needsOrgUpdate)   updatePayload.organization_id  = organizationId;
          try {
            await rdRequest("PUT", `/contacts/${existingId}`, updatePayload);
            console.log(`[RD CRM] Contato ${existingId} atualizado (email/nome/empresa).`);
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
      // FIX: sempre sobrescreve email, nome e organização quando o cliente informou novos dados
      const existingEmail = byPhone[0].emails?.[0]?.email ?? '';
      const existingName  = (byPhone[0].name ?? '').toLowerCase().trim();
      const newEmail = posVenda.email?.trim().toLowerCase() ?? '';
      const newName  = posVenda.nome?.trim().toLowerCase() ?? '';
      const needsEmailUpdate = newEmail && newEmail !== existingEmail;
      const needsNameUpdate  = newName  && newName  !== existingName;
      const needsOrgUpdate   = organizationId && !byPhone[0].organization_id;
      if (needsEmailUpdate || needsNameUpdate || needsOrgUpdate) {
        const updatePayload: Record<string, any> = {};
        if (needsEmailUpdate) updatePayload.emails          = [{ email: newEmail }];
        if (needsNameUpdate)  updatePayload.name             = posVenda.nome;
        if (needsOrgUpdate)   updatePayload.organization_id  = organizationId;
        try {
          await rdRequest("PUT", `/contacts/${existingId}`, updatePayload);
          console.log(`[RD CRM] Contato ${existingId} atualizado (email/nome/empresa).`);
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

// Cache de IDs do funil PÓS VENDA (buscados dinamicamente pelo nome)
let _posVendaPipelineId: string | null = null;
let _posVendaFirstStageId: string | null = null;

/**
 * Busca dinamicamente os IDs do funil "PÓS VENDA" no RD CRM.
 * Usa env vars como override, e recorre à busca por nome como fallback.
 */
async function getPosVendaPipelineIds(): Promise<{ pipelineId: string; stageId: string }> {
  // Cache em memória
  if (_posVendaPipelineId && _posVendaFirstStageId) {
    return { pipelineId: _posVendaPipelineId, stageId: _posVendaFirstStageId };
  }

  // Busca dinâmica pelo nome do funil
  try {
    const pipelines = await rdRequest<any>('GET', '/pipelines?page[size]=50');
    const list: any[] = Array.isArray(pipelines) ? pipelines : (Array.isArray(pipelines?.data) ? pipelines.data : []);
    
    // Procura por funil que contenha "pós venda" ou "pos venda" no nome (case-insensitive)
    const found = list.find((p: any) => p.name && p.name.toLowerCase().replace('ó', 'o').includes('pos venda'));

    if (found) {
      _posVendaPipelineId = found.id;
      // Pega o primeiro stage do pipeline
      try {
        const stages = await rdRequest<any>(`GET`, `/pipelines/${found.id}/stages?page[size]=50`);
        const stageList: any[] = Array.isArray(stages) ? stages : (Array.isArray(stages?.data) ? stages.data : []);
        if (stageList.length > 0) {
          _posVendaFirstStageId = stageList[0].id;
          console.log(`[RD CRM] PÓS VENDA: pipeline="${found.name}" id=${found.id}, primeira stage="${stageList[0].name}" id=${stageList[0].id}`);
        }
      } catch (stageErr: any) {
        console.warn('[RD CRM] PÓS VENDA: falha ao buscar stages do pipeline:', stageErr.message);
      }
    } else {
      console.warn(`[RD CRM] PÓS VENDA: funil contendo "PÓS VENDA" não encontrado. Configure RD_CRM_PIPELINE_OS_ID.`);
    }
  } catch (e: any) {
    console.warn('[RD CRM] PÓS VENDA: falha ao buscar pipelines:', e.message);
  }

  if (!_posVendaPipelineId || !_posVendaFirstStageId) {
    // Fallback 1: usar env vars caso o funil PÓS VENDA não seja encontrado
    const envPipeline = process.env.RD_CRM_PIPELINE_OS_ID;
    const envStage    = process.env.RD_CRM_PIPELINE_OS_STAGE_ID;
    
    if (envPipeline && envStage) {
      _posVendaPipelineId = envPipeline;
      _posVendaFirstStageId = envStage;
      console.log(`[RD CRM] PÓS VENDA: usando IDs de env vars como fallback (pipeline=${envPipeline}, stage=${envStage})`);
    } else {
      // Fallback 2: hardcoded original
      _posVendaPipelineId = "67c9f944c7fe880018b30ab1";
      _posVendaFirstStageId = ""; 
      console.warn(`[RD CRM] PÓS VENDA: usando fallback fixo O.S`);
    }
  }

  return { pipelineId: _posVendaPipelineId!, stageId: _posVendaFirstStageId! };
}


/**
 * Cria a negociação no RD CRM.
 *
 * - Título: "FAGNER - NOME DO CLIENTE" (sem "Pós Venda")
 * - Informações complementares: resumo real da conversa e problema do cliente
 */
async function createDeal(
  posVenda: PosVendaData,
  contactId: string,
  organizationId?: string | null,
  resolvedSourceId?: string | null
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

  const { pipelineId, stageId } = await getPosVendaPipelineIds();
  // Prioridade: ownerId passado pelo chamador (rodízio do painel) > env var (fallback hardcoded)
  const rawOwner   = ((posVenda as any).ownerId || process.env.RD_CRM_OWNER_POS_VENDA_ID || "").trim();

  // ⚠️ BSON ObjectId validation: o RD CRM exige exatamente 24 caracteres hexadecimais.
  // Se o ID configurado no painel for um UUID (ex: "6804c1df-...") ou outro formato
  // inválido, a API retorna 422 "owner_id must be BSON::ObjectId or is in invalid format".
  // Validamos aqui para dar um erro descritivo ao invés de um 422 genérico.
  const BSON_ID_RE = /^[a-f0-9]{24}$/i;
  const ownerId = BSON_ID_RE.test(rawOwner) ? rawOwner : '';
  if (rawOwner && !ownerId) {
    console.error(`[RD CRM] ❌ owner_id inválido (não é BSON ObjectId): "${rawOwner}". Acesse as Configurações do LiveChat e selecione novamente o operador para o funil.`);
    throw new Error(`owner_id inválido: "${rawOwner}" — deve ser um BSON ObjectId de 24 caracteres hexadecimais. Reconfigure o operador no painel de Configurações.`);
  }

  if (!stageId) throw new Error("[RD CRM] Stage ID de Pós Venda não encontrado e RD_CRM_PIPELINE_OS_STAGE_ID não configurado");
  if (!ownerId) throw new Error("[RD CRM] Nenhum owner configurado para Pós Venda — configure operadores no painel ou defina RD_CRM_OWNER_POS_VENDA_ID");

  console.log(`[RD CRM] Owner Pós Venda: ${ownerId} (fonte: ${(posVenda as any).ownerId ? 'rodízio do painel' : 'env var fallback'})`);

  // Usa sourceId já resolvido pelo contexto do visitante, ou fallback padrão
  const campaignId = await getOrCreateCampaignId();
  const sourceId = resolvedSourceId ?? await getOrCreateSourceId();

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

/**
 * Adiciona uma anotação de atualização a um deal EXISTENTE no RD CRM.
 * Usado quando o mesmo visitante solicita uma segunda máquina na mesma sessão —
 * em vez de criar um card duplicado, registra a nova demanda como nota no card já existente.
 */
export async function addNoteToExistingDeal(dealId: string, nota: string): Promise<void> {
  await rdRequest("POST", `/deals/${dealId}/notes`, { description: nota });
  console.log(`[RD CRM] ✅ Nota de atualização adicionada ao deal existente ${dealId}`);
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
      user_id: ownerId, // <--- Adicionado para satisfazer 'Created by is required'
      created_by_id: ownerId, // Garantia de payload para a API
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
  posVendaData: Omit<PosVendaData, 'conversationSnippet'> & { conversationSummary?: string; ownerId?: string },
  relatorio: string
): Promise<string> {
  if (!process.env.RD_CRM_CLIENT_ID) {
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

  // Resolve ownerId: prioridade ao valor do rodízio do painel, com env var como fallback
  const ownerId = (posVendaData.ownerId || process.env.RD_CRM_OWNER_POS_VENDA_ID || "").trim();
  console.log(`[RD CRM] Pós Venda owner: ${ownerId} (fonte: ${posVendaData.ownerId ? 'rodízio do painel' : 'env var fallback'})`);

  // ── Resolução dinâmica do campo "Fonte" no RD CRM ─────────────────────────────────────
  // Busca os dados UTM do visitante no banco para identificar o canal de aquisição
  let resolvedSourceId: string | null = null;
  try {
    const [visitorUtm] = await db.select({
      utmSource:   lcVisitors.utmSource,
      utmMedium:   lcVisitors.utmMedium,
      utmCampaign: lcVisitors.utmCampaign,
      referrer:    lcVisitors.referrer,
    }).from(lcVisitors).where(eq(lcVisitors.id, visitorId));

    const sourceName = resolveLeadSourceName(
      visitorUtm?.utmSource,
      visitorUtm?.utmMedium,
      visitorUtm?.utmCampaign,
      visitorUtm?.referrer
    );
    console.log(`[RD CRM] Pós Venda — Fonte resolvida: "${sourceName}"`);
    resolvedSourceId = await getSourceIdByName(sourceName);
  } catch (srcErr: any) {
    console.warn(`[RD CRM] Pós Venda: falha ao resolver fonte (usará fallback):`, srcErr.message);
  }

  // 1. Empresa — SEMPRE cria (com CNPJ se disponível, com nome do cliente como fallback)
  // Não condiciona mais ao isCnpj/isCpf — toda negociação deve ter empresa vinculada
  let organizationId: string | null = null;
  try {
    organizationId = await findOrCreateOrganization(posVendaData as any, ownerId);
    console.log(`[RD CRM] Pós Venda: empresa ${organizationId ? 'criada/encontrada: ' + organizationId : 'FALHOU'}`);
  } catch (orgErr: any) {
    console.error(`[RD CRM] ❌ Pós Venda: erro ao criar empresa: ${orgErr.message}`);
  }

  // 2. Contato (cria ou busca, e atualiza e-mail se necessário)
  const contactId = await upsertContact(posVendaData as PosVendaData, organizationId);

  // 3. Negociação — createDeal usa posVendaData.ownerId (rodízio) com fallback para env var
  const { dealId, ownerId: resolvedOwner } = await createDeal(posVendaData as PosVendaData, contactId, organizationId, resolvedSourceId);

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

// ── Fallback UUIDs dos campos personalizados do funil MÁQUINAS 2.0 ──────────
// ⚠️ ATENÇÃO: A API RD CRM v2 usa SLUGS como chaves em custom_fields, não UUIDs.
// Esses UUIDs são mantidos apenas como fallback caso o fetchDealCfCache() falhe.
// Os slugs reais são resolvidos dinamicamente via GET /custom_fields em tempo de execução.
const CF_MAQUINAS_FALLBACK_UUID = {
  clienteNovo:  process.env.RD_CF_CLIENTE_NOVO_ID  || '696e23bcce280300133ca1e4', // fallback UUID
  sdr:          process.env.RD_CF_SDR_ID            || '67c89b29ab621d001750e51b', // fallback UUID
  produto:      process.env.RD_CF_PRODUTO_ID        || '696a909d97a619001cf475ad', // fallback UUID
  volume:       process.env.RD_CF_VOLUME_ID         || '696a98c77ce6e30022756978', // fallback UUID
  complementar: process.env.RD_CF_COMPLEMENTAR_ID  || '696bd749b44b6d00179417a0', // fallback UUID
};
// Slugs reais (preenchidos dinamicamente pelo fetchDealCfCache — não editar manualmente)
const CF_MAQUINAS_SLUGS: Record<string, string> = {}; // ex: { clienteNovo: 'cliente_novo', ... }

/** Carrega e armazena em cache os campos personalizados de deal (id + slug + tipo). */
async function fetchDealCfCache(): Promise<DealCfInfo[]> {
  const CACHE_TTL = 30 * 60 * 1000; // 30 min TTL
  if (_dealCfCache && Date.now() - _dealCfCacheLoadedAt < CACHE_TTL) return _dealCfCache;
  try {
    const raw = await rdRequest<any>('GET', '/custom_fields?filter=entity:deal&page[size]=100');
    const list: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    _dealCfCache = list.map(f => ({ id: f.id ?? '', name: f.name ?? '', slug: f.slug ?? '', type: f.type, options: f.options }));
    _dealCfCacheLoadedAt = Date.now();
    console.log(`[RD CRM] Deal CFs carregados: ${_dealCfCache.length} campos`);
    console.log('[RD CRM] Deal CF catalog:', JSON.stringify(_dealCfCache.map(f => ({ id: f.id, name: f.name, slug: f.slug, type: f.type }))));
    return _dealCfCache;
  } catch (e: any) {
    console.error('[RD CRM] ⚠️ Falha ao carregar deal CFs (usando UUID fallback):', e.message);
    return [];
  }
}

/** Encontra um campo personalizado de deal pelo nome parcial. */
function findCfByPartialName(cfs: DealCfInfo[], partial: string): DealCfInfo | undefined {
  const lower = partial.toLowerCase();
  return cfs.find(f =>
    f.name.toLowerCase().includes(lower) ||
    f.slug.toLowerCase().includes(lower.replace(/[\s?]/g, '_').replace(/[^a-z0-9_]/g, ''))
  );
}

/**
 * Resolve a chave a usar em custom_fields:
 *  1. Slug dinâmico (preferido — o que a API aceita de verdade)
 *  2. UUID fallback hardcoded (caso a busca falhe)
 */
function resolveCfKey(cfs: DealCfInfo[], partialName: string, fallbackUuid: string): string {
  const found = findCfByPartialName(cfs, partialName);
  if (found?.slug) {
    CF_MAQUINAS_SLUGS[partialName] = found.slug; // armazena para debug
    return found.slug;
  }
  // Se a busca por slug falhou mas encontrou por id, usa o id
  if (found?.id) return found.id;
  console.warn(`[RD CRM] Campo "${partialName}" não encontrado no CRM — usando UUID fallback: ${fallbackUuid}`);
  return fallbackUuid;
}

/**
 * Cria uma negociação no funil MÁQUINAS 2.0 do RD CRM.
 * Título: "FAGNER | NOME DO CLIENTE"
 * Campos personalizados: CLIENTE NOVO?, QUALIFICADO POR SDR, QUAL O PRODUTO FABRICADO?, VOLUME DE PRODUÇÃO?
 */
async function createMaquinasDeal(
  maqData: MaquinasData,
  contactId: string,
  organizationId?: string | null,
  resolvedSourceId?: string | null
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
  let ownerId = (maqData.ownerId || (process.env.RD_CRM_OWNER_MAQUINAS_ID ?? '')).trim();

  // Se owner não configurado, busca o primeiro usuário ativo do RD CRM
  if (!ownerId) {
    console.warn('[RD CRM] ⚠️ Owner MÁQUINAS não configurado — buscando primeiro usuário ativo...');
    try {
      const usersData = await rdRequest<any>('GET', '/users?filter=is:active&page[size]=1');
      const users: any[] = Array.isArray(usersData) ? usersData : (Array.isArray(usersData?.data) ? usersData.data : []);
      if (users.length > 0) {
        ownerId = users[0].id;
        console.log(`[RD CRM] Owner MÁQUINAS resolvido do RD CRM: ${ownerId} (${users[0].name})`);
      }
    } catch (e: any) {
      console.error(`[RD CRM] ❌ Falha ao buscar usuários para owner: ${e.message}`);
    }
  }

  const campaignId = await getOrCreateCampaignId();
  const sourceId = resolvedSourceId ?? await getOrCreateSourceId();

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

  // ── Campos personalizados: resolução DINÂMICA por slug ─────────────────────
  // A API RD CRM aceita chaves em custom_fields como SLUG (ex: "cliente_novo"),
  // não como UUID. Buscamos os slugs em tempo de execução via GET /custom_fields.
  // UUID é mantido apenas como fallback de emergência.

  const SDR_OPTIONS: Record<string, string> = {
    '1': 'Decisor com Pressa (Falou com quem manda e ele quer solução rápida)',
    '2': 'Planejando Investimento (Interesse real, mas sem data definida)',
    '3': 'Troca de Máquina (Já tem o processo e quer apenas renovar)',
    '4': 'Curioso / Estudante (Não é empresa ou não tem intenção de compra)',
    '5': 'Fora de Portfólio (Quer algo que a Tecfag não fabrica)',
    '6': 'Sumiu / Sem contato (Não atendeu ou não retornou)',
  };

  // Valores base (sem fallback "Não informado" em campos option/multiple_choice — causa 422)
  const clienteNovoVal  = (maqData.clienteNovo ?? 'SIM').toUpperCase();
  const qualificacaoKey = maqData.qualificacaoSDR ?? '2';
  const sdrVal          = SDR_OPTIONS[qualificacaoKey] ?? SDR_OPTIONS['2'];
  const produtoVal      = maqData.produtoFabricado || null; // null = omitir se não informado
  const volumeVal       = maqData.volumeProducao   || null; // null = omitir se não informado (opções fixas no CRM!)

  // Monta texto das informações complementares (campo freetext — qualquer valor aceito)
  const partes: string[] = [`Máquina: ${maqData.maquinaDesejada}`];
  if (maqData.produtoFabricado) partes.push(`Produto: ${maqData.produtoFabricado}`);
  if (maqData.volumeProducao)   partes.push(`Volume: ${maqData.volumeProducao}`);
  if (maqData.cnpjCpf)          partes.push(`CNPJ/CPF: ${maqData.cnpjCpf}`);
  if (maqData.detalhes)         partes.push(`Detalhes: ${maqData.detalhes}`);
  const complementarVal = partes.join(' | ').slice(0, 500);

  // Busca slugs dinâmicos (resolve em runtime e armazena em cache 30min)
  const dealCfs = await fetchDealCfCache();

  /**
   * Mapeia um valor para a opção válida mais próxima de um campo option/multiple_choice.
   * Retorna null se nenhuma opção compatível for encontrada (campo será OMITIDO do payload,
   * evitando o erro 422 "Deal custom fields Não é válido.").
   */
  const safeMapCfValue = (value: string, cfInfo?: DealCfInfo): string | null => {
    if (!value) return null;
    // Para campos text/date/number: qualquer valor é aceito
    if (!cfInfo || (cfInfo.type !== 'option' && cfInfo.type !== 'multiple_choice')) return value;
    const opts = cfInfo.options ?? [];
    if (opts.length === 0) return value; // sem restrição definida
    const lower = value.toLowerCase().trim();
    // 1. Correspondência exata (case-insensitive + trim)
    const exact = opts.find(o => o.toLowerCase().trim() === lower);
    if (exact) return exact;
    // 2. Value começa com uma opção (ex: "Baixo volume (< 1.000 un/dia)" → "Baixo volume")
    const prefix = opts.find(o => lower.startsWith(o.toLowerCase().trim()));
    if (prefix) return prefix;
    // 3. Opção contém o value inteiro (ex: "Sumiu..." inclui versão sem ponto)
    const contains = opts.find(o => o.toLowerCase().includes(lower));
    if (contains) return contains;
    // 4. Primeira palavra do value é suficiente para identificar a opção (ex: "Baixo" → "Baixo volume")
    const firstWord = lower.split(/[\s(,]/)[0];
    if (firstWord.length > 3) {
      const fw = opts.find(o => o.toLowerCase().startsWith(firstWord));
      if (fw) return fw;
    }
    // Não encontrou match válido → omite o campo (não envia valor inválido)
    console.warn(`[RD CRM] ⚠️ Valor "${value.slice(0, 60)}" não é opção válida para "${cfInfo.name}". Opções: [${opts.slice(0, 5).map(o => `"${o.slice(0,30)}"`).join(', ')}]. Campo OMITIDO.`);
    return null;
  };

  // Monta payload apenas com campos válidos (omite os que causariam 422)
  const customFieldsPayload: Record<string, string> = {};
  const addCf = (partialName: string, fallbackKey: string, value: string | null) => {
    if (value === null) return; // sem valor → omitir
    const cfInfo = findCfByPartialName(dealCfs, partialName);
    const key = cfInfo?.slug || fallbackKey;
    const safeValue = safeMapCfValue(value, cfInfo);
    if (safeValue !== null) {
      customFieldsPayload[key] = safeValue;
    }
  };

  addCf('cliente novo',  CF_MAQUINAS_FALLBACK_UUID.clienteNovo,  clienteNovoVal);
  addCf('qualificado',   CF_MAQUINAS_FALLBACK_UUID.sdr,          sdrVal);
  addCf('produto fabr',  CF_MAQUINAS_FALLBACK_UUID.produto,       produtoVal);
  addCf('volume',        CF_MAQUINAS_FALLBACK_UUID.volume,        volumeVal);
  addCf('complementar',  CF_MAQUINAS_FALLBACK_UUID.complementar,  complementarVal);

  dealPayload.custom_fields = customFieldsPayload;

  console.log('[RD CRM] custom_fields MÁQUINAS — payload final:', JSON.stringify({
    modo:    dealCfs.length > 0 ? 'SLUG_DINÂMICO' : 'UUID_FALLBACK',
    campos:  Object.entries(customFieldsPayload).map(([k, v]) => ({ key: k, val: String(v).slice(0, 50) })),
    omitidos: ['clienteNovo', 'sdr', 'produto', 'volume', 'complementar']
      .filter(f => !Object.keys(customFieldsPayload).some(k => k.includes(f.toLowerCase().replace(' ', '-')))).join(', ') || 'nenhum',
  }));

  // ── Criar negociação ──────────────────────────────────────────────────────
  const deal = await rdRequest<{ id: string; custom_fields?: any }>('POST', '/deals', dealPayload);
  console.log(`[RD CRM] ✅ Negociação MÁQUINAS criada: ${deal.id} — "${titulo}"`);

  // ── Verificação pós-criação: confirma se custom_fields foram salvos ────────
  // Se a API ignorou os custom_fields (ex: chave inválida), faz um PUT síncrono para forçar
  try {
    const savedDeal = await rdRequest<any>('GET', `/deals/${deal.id}`);
    const savedCf = savedDeal?.custom_fields ?? {};
    const allEmpty = Object.values(savedCf).every((v: any) => v === null || v === undefined || v === '');
    console.log(`[RD CRM] Deal ${deal.id} — custom_fields na base:`, JSON.stringify(savedCf));

    if (allEmpty) {
      console.warn(`[RD CRM] ⚠️ custom_fields vazio após criação! API ignorou as chaves. Tentando PUT para corrigir...`);
      try {
        await rdRequest('PUT', `/deals/${deal.id}`, { custom_fields: customFieldsPayload });
        console.log('[RD CRM] ✅ custom_fields enviados via PUT (fallback)');
        // Reset cache para forçar re-fetch dos slugs na próxima tentativa
        _dealCfCache = null;
        _dealCfCacheLoadedAt = 0;
      } catch (putErr: any) {
        console.error('[RD CRM] ❌ PUT custom_fields também falhou:', putErr.message);
      }
    } else {
      console.log('[RD CRM] ✅ custom_fields confirmados na base do CRM');
    }
  } catch (verifyErr: any) {
    console.warn('[RD CRM] Verificação pós-criação falhou (não crítico):', verifyErr.message);
  }

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

  // Resolve owner antes de criar a empresa (obrigatório do CRM)
  const ownerId = (maqData.ownerId || (process.env.RD_MAQUINAS_OWNER_ID ?? process.env.RD_CRM_OWNER_MAQUINAS_ID ?? '')).trim();

  // ── Resolução dinâmica do campo "Fonte" no RD CRM ─────────────────────────
  // Busca os dados UTM do visitante para identificar o canal de aquisição real
  let resolvedSourceId: string | null = null;
  try {
    const [visitorUtm] = await db.select({
      utmSource:   lcVisitors.utmSource,
      utmMedium:   lcVisitors.utmMedium,
      utmCampaign: lcVisitors.utmCampaign,
      referrer:    lcVisitors.referrer,
    }).from(lcVisitors).where(eq(lcVisitors.id, visitorId));

    const sourceName = resolveLeadSourceName(
      visitorUtm?.utmSource,
      visitorUtm?.utmMedium,
      visitorUtm?.utmCampaign,
      visitorUtm?.referrer
    );
    console.log(`[RD CRM] MÁQUINAS — Fonte resolvida: "${sourceName}"`);
    resolvedSourceId = await getSourceIdByName(sourceName);
  } catch (srcErr: any) {
    console.warn(`[RD CRM] MÁQUINAS: falha ao resolver fonte (usará fallback):`, srcErr.message);
  }

  // FIX #2: empresa sempre criada — com CNPJ/CPF se disponível, com nome do cliente como fallback
  let organizationId: string | null = null;
  const docDigits = (maqData.cnpjCpf ?? "").replace(/\D/g, "");
  const isCnpj = docDigits.length === 14;
  const isCpf  = docDigits.length === 11;

  try {
    if (isCnpj || isCpf) {
      organizationId = await findOrCreateOrganization(maqData as any, ownerId);
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
  const { dealId, ownerId: resolvedOwner } = await createMaquinasDeal(maqData, contactId, organizationId, resolvedSourceId);

  // 4. Anotação com relatório completo
  await createNote(dealId, relatorio);

  // 5. Tarefa de ligação imediata — usa o MESMO owner já resolvido no deal
  if (resolvedOwner) {
    await createCallTask(dealId, resolvedOwner, maqData.nome, maqData.telefone, "Máquinas 2.0");
  } else {
    console.error("[RD CRM] ❌ Máquinas: owner vazio — tarefa NÃO criada. Configure RD_CRM_OWNER_MAQUINAS_ID ou adicione usuários no rodízio.");
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

    const found = list.find((p: any) => p.name === FUNIL_NAME);

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
  organizationId?: string | null,
  resolvedSourceId?: string | null
): Promise<{ dealId: string; ownerId: string }> {
  const titulo = `FAGNER | ${pecasData.nome}`;

  const infoCompl = pecasData.conversationSummary
    ?? `Peça: ${pecasData.pecaDesejada}${pecasData.eCliente ? ` | É cliente: ${pecasData.eCliente}` : ''}`.trim();

  const { pipelineId, stageId } = await getPecasPipelineIds();
  const ownerId = (pecasData.ownerId || (process.env.RD_CRM_OWNER_PECAS_ID ?? '')).trim();

  if (!ownerId) {
    console.warn('[RD CRM] Owner ID para peças não configurado — deal sem responsável definido');
  }

  const campaignId = await getOrCreateCampaignId();
  const sourceId = resolvedSourceId ?? await getOrCreateSourceId();

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
  // Resolve owner antes de criar a empresa
  const ownerId = (pecasData.ownerId || (process.env.RD_PECAS_OWNER_ID ?? process.env.RD_CRM_OWNER_PECAS_ID ?? '')).trim();

  // ── Resolução dinâmica do campo "Fonte" no RD CRM ─────────────────────────
  let resolvedSourceId: string | null = null;
  try {
    const [visitorUtm] = await db.select({
      utmSource:   lcVisitors.utmSource,
      utmMedium:   lcVisitors.utmMedium,
      utmCampaign: lcVisitors.utmCampaign,
      referrer:    lcVisitors.referrer,
    }).from(lcVisitors).where(eq(lcVisitors.id, visitorId));

    const sourceName = resolveLeadSourceName(
      visitorUtm?.utmSource,
      visitorUtm?.utmMedium,
      visitorUtm?.utmCampaign,
      visitorUtm?.referrer
    );
    console.log(`[RD CRM] PEÇAS — Fonte resolvida: "${sourceName}"`);
    resolvedSourceId = await getSourceIdByName(sourceName);
  } catch (srcErr: any) {
    console.warn(`[RD CRM] PEÇAS: falha ao resolver fonte (usará fallback):`, srcErr.message);
  }

  let organizationId: string | null = null;
  const docDigits = (pecasData.cnpjCpf ?? "").replace(/\D/g, "");

  try {
    if (docDigits.length === 14 || docDigits.length === 11) {
      organizationId = await findOrCreateOrganization(pecasData as any, ownerId);
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
  const { dealId, ownerId: resolvedOwner } = await createPecasDeal(pecasData, contactId, organizationId, resolvedSourceId);

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

