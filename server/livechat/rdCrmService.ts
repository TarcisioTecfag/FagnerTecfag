/**
 * rdCrmService.ts
 * Serviço de integração com o RD Station CRM v2 para criação automática
 * de OS de Pós Venda (Contato + Negociação + Anotação).
 *
 * Fonte de verdade da API: /RD STATION CRM - API COMPLETA.txt no projeto.
 * NUNCA buscar endpoints ou contratos na internet.
 */

import db from "../db.js";
import { lcVisitors } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

// ─── Constantes ────────────────────────────────────────────────────────────────
const RD_API_BASE = "https://api.rd.services/crm/v2";
const RD_AUTH_URL = "https://api.rd.services/oauth2/token";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface PosVendaData {
  nome: string;
  telefone: string;
  email?: string | null;
  cnpjCpf?: string | null;
  notaPedido?: string | null;
  problema: string;
}

interface RdToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp ms
}

// ─── Token storage em memória + env (sem tabela extra — tokens no env Railway) ─
let _tokenCache: RdToken | null = null;

function loadTokenFromEnv(): RdToken | null {
  const at = process.env.RD_CRM_ACCESS_TOKEN;
  const rt = process.env.RD_CRM_REFRESH_TOKEN;
  if (!at || !rt) return null;
  // Assume token ainda válido, refresh vai ocorrer no primeiro 401
  return { accessToken: at, refreshToken: rt, expiresAt: Date.now() + 7200_000 };
}

function saveTokenToEnv(token: RdToken) {
  // Em produção os tokens são renovados em memória.
  // O Railway não permite escrever em .env em runtime, então
  // mantemos em cache de processo. Ao reiniciar, o refresh acontece
  // automaticamente no primeiro uso via o refresh_token salvo no Railway.
  _tokenCache = token;
  process.env.RD_CRM_ACCESS_TOKEN = token.accessToken;
  process.env.RD_CRM_REFRESH_TOKEN = token.refreshToken;
}

async function refreshAccessToken(): Promise<RdToken> {
  const clientId     = process.env.RD_CRM_CLIENT_ID!;
  const clientSecret = process.env.RD_CRM_CLIENT_SECRET!;
  const refreshToken = _tokenCache?.refreshToken ?? process.env.RD_CRM_REFRESH_TOKEN!;

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
  saveTokenToEnv(token);
  console.log("[RD CRM] Token renovado com sucesso.");
  return token;
}

/** Retorna um access_token válido, renovando se necessário. */
async function getValidToken(): Promise<string> {
  if (!_tokenCache) {
    _tokenCache = loadTokenFromEnv();
  }
  // Renova se expirar em menos de 5 minutos
  if (!_tokenCache || _tokenCache.expiresAt - Date.now() < 5 * 60_000) {
    _tokenCache = await refreshAccessToken();
  }
  return _tokenCache.accessToken;
}

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

// ─── Contatos ────────────────────────────────────────────────────────────────
/**
 * Busca contato pelo telefone. Retorna o primeiro encontrado ou null.
 */
async function findContactByPhone(phone: string): Promise<{ id: string } | null> {
  // Remove caracteres não numéricos para normalizar
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
 * Cria contato no RD CRM ou retorna o existente (busca por telefone).
 */
async function findOrCreateContact(posVenda: PosVendaData): Promise<string> {
  // Tentar encontrar pelo telefone primeiro
  const existing = await findContactByPhone(posVenda.telefone);
  if (existing) {
    console.log(`[RD CRM] Contato existente encontrado: ${existing.id}`);
    return existing.id;
  }

  // Criar novo contato
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
    contactPayload.emails = [{ email: posVenda.email }];
  }

  const contact = await rdRequest<{ id: string }>("POST", "/contacts", contactPayload);
  console.log(`[RD CRM] Contato criado: ${contact.id}`);
  return contact.id;
}

// ─── Negociações ─────────────────────────────────────────────────────────────
/**
 * Cria uma negociação no funil O.S → etapa "PÓS VENDA" → responsável Melissa Bueno.
 */
async function createDeal(posVenda: PosVendaData, contactId: string): Promise<string> {
  const problema = posVenda.problema ?? "Suporte pós-venda";
  const titulo   = `Pós Venda — ${posVenda.nome} — ${problema.slice(0, 50)}`;

  const dealPayload: Record<string, any> = {
    name:        titulo,
    stage_id:    process.env.RD_CRM_PIPELINE_OS_STAGE_ID!,
    owner_id:    process.env.RD_CRM_OWNER_POS_VENDA_ID!,
    contact_ids: [contactId],
    status:      "ongoing",
  };

  if (posVenda.notaPedido) {
    dealPayload.custom_fields = { nota_pedido: posVenda.notaPedido };
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
/**
 * Orquestra a criação completa de uma OS de Pós Venda no RD CRM:
 * 1. Busca/cria o Contato pelo telefone
 * 2. Cria a Negociação no Funil O.S → etapa "PÓS VENDA"
 * 3. Cria a Anotação com o relatório gerado pelo Fagner/Gemini
 * 4. Atualiza o rdCrmDealId no lcVisitors para evitar duplicatas
 *
 * @returns ID da negociação criada
 */
export async function createPosVendaOS(
  visitorId: string,
  posVenda: PosVendaData,
  relatorio: string
): Promise<string> {
  // Verificar configuração mínima
  if (!process.env.RD_CRM_CLIENT_ID || !process.env.RD_CRM_PIPELINE_OS_STAGE_ID) {
    throw new Error("[RD CRM] Variáveis de ambiente RD CRM não configuradas.");
  }

  // Verificar se já existe uma OS para este visitante (evitar duplicata)
  const [visitor] = await db.select({ rdCrmDealId: lcVisitors.rdCrmDealId })
    .from(lcVisitors)
    .where(eq(lcVisitors.id, visitorId));

  if (visitor?.rdCrmDealId) {
    console.log(`[RD CRM] Visitante ${visitorId} já tem OS: ${visitor.rdCrmDealId}. Pulando criação.`);
    return visitor.rdCrmDealId;
  }

  console.log(`[RD CRM] Criando OS de Pós Venda para visitante ${visitorId}...`);

  // 1. Contato
  const contactId = await findOrCreateContact(posVenda);

  // 2. Negociação
  const dealId = await createDeal(posVenda, contactId);

  // 3. Anotação
  await createNote(dealId, relatorio);

  // 4. Persistir o dealId no visitante
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
