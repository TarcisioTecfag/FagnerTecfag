// server/fagner/rdConversasService.ts
// Integração com a API RD Station Conversas (Tallos) — v2/v3
// Base URL: https://api.tallos.com.br
// Docs: https://docs.rdstation.com/conversas

const RD_BASE = process.env.RD_CONVERSAS_API_URL ?? "https://api.tallos.com.br";
const RD_TOKEN = process.env.RD_CONVERSAS_TOKEN ?? "";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RdContact {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface RdSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  isMock?: boolean;
}

export interface RdFlow {
  id: string;
  title: string;
}

export interface RdEmployee {
  id: string;
  name: string;
  email: string;
}

// ─── Helper de request JSON ───────────────────────────────────────────────────

async function rdJson(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: object
): Promise<{ ok: boolean; status: number; data: any }> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — ${method} ${path}`);
    return { ok: true, status: 200, data: { mock: true } };
  }

  try {
    const res = await fetch(`${RD_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RD_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    console.error(`[RD Conversas] Erro ${method} ${path}:`, err.message);
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

// ─── Helper de request multipart/form-data ───────────────────────────────────
// A API /v2/messages/{id}/send exige multipart/form-data, NÃO JSON

async function rdFormData(
  path: string,
  fields: Record<string, string>
): Promise<{ ok: boolean; status: number; data: any }> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — POST (form) ${path}`);
    return { ok: true, status: 200, data: { mock: true } };
  }

  try {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== "") form.append(k, v);
    }

    const res = await fetch(`${RD_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${RD_TOKEN}` },
      // Não setar Content-Type manualmente — o fetch define o boundary do multipart
      body: form,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    console.error(`[RD Conversas] Erro POST (form) ${path}:`, err.message);
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

// ─── Enviar mensagem de texto ─── POST /v2/messages/{contact_id}/send ──────────
// A API exige multipart/form-data com:
//   message  (string)         — texto da mensagem       [obrigatório]
//   sent_by  (bot | operator) — quem está enviando      [obrigatório]
//   integration (string)      — nome/ID do chip WA      [opcional mas recomendado]
//   operator (string)         — ID do operador se sent_by=operator

export async function sendMessage(
  contactId: string,
  text: string,
  options?: { integration?: string; sentBy?: "bot" | "operator"; operatorId?: string }
): Promise<RdSendResult> {
  // ── Interceptador para sessões de simulação (painel "Ao Vivo") ───────────────
  const interceptor = (global as any).__fagnerSimInterceptor as
    | ((contactId: string, text: string) => boolean)
    | undefined;
  if (interceptor?.(contactId, text)) {
    return { ok: true, messageId: `sim-${Date.now()}`, isMock: true };
  }

  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Enviando para ${contactId}: "${text.slice(0, 80)}..."`);
    return { ok: true, messageId: `mock-${Date.now()}`, isMock: true };
  }

  const integration = options?.integration ?? process.env.RD_CONVERSAS_INTEGRATION ?? "";
  const sentBy = options?.sentBy ?? "bot";

  // Retry: até 3 tentativas com delay de 2s
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await rdFormData(`/v2/messages/${contactId}/send`, {
      message: text,
      sent_by: sentBy,
      ...(integration ? { integration } : {}),
      ...(sentBy === "operator" && options?.operatorId ? { operator: options.operatorId } : {}),
    });

    if (r.ok) {
      return { ok: true, messageId: r.data?.id };
    }

    // 422 = mensagem inválida (não adianta tentar de novo)
    if (r.status === 422) {
      console.error(`[RD Conversas] Mensagem rejeitada (422) para ${contactId}:`, r.data);
      return { ok: false, error: `Mensagem rejeitada: ${JSON.stringify(r.data)}` };
    }

    if (attempt < 2) {
      await new Promise((res) => setTimeout(res, 2_000));
    }
  }

  return { ok: false, error: "Falha ao enviar mensagem após 3 tentativas" };
}

// ─── Buscar contato por telefone ─── GET /v2/contacts/{cel_phone}/exists ──────
// ATENÇÃO: a busca é por número de telefone no formato E.164 (ex: 5511999998888)
// NÃO pelo ID do contato — o ID do contato vem no webhook do RD Conversas

export async function getContactByPhone(phone: string): Promise<RdContact | null> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Buscando contato por telefone ${phone}`);
    return { id: `mock-${phone}`, name: "Contato Mock", phone };
  }

  // Sanitiza: remove não-dígitos
  const sanitized = phone.replace(/\D/g, "");
  if (!sanitized) return null;

  const r = await rdJson("GET", `/v2/contacts/${sanitized}/exists?channel=whatsapp`);
  if (!r.ok) return null;

  const d = r.data?.data;
  if (!d) return null;

  return {
    id: d._id ?? sanitized,
    name: d.full_name ?? undefined,
    phone: d.cel_phone ?? sanitized,
    email: d.email ?? undefined,
  };
}

// Mantém compatibilidade com chamadas existentes do orchestrator (que passa o contactId)
// No RD Conversas, o contactId do webhook = ID interno do contato
// Para buscar por ID ainda não há endpoint direto, mas guardamos o que vier no webhook
export async function getContactInfo(contactId: string): Promise<RdContact | null> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Buscando contato ${contactId}`);
    return { id: contactId, name: "Contato Mock" };
  }

  // Se parecer um número de telefone (10-15 dígitos), tenta buscar por telefone
  const digits = contactId.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    return getContactByPhone(digits);
  }

  // ID interno — não há endpoint direto; retorna o mínimo disponível
  return { id: contactId };
}

// ─── Criar / Atualizar contato ─── PUT /v2/contacts/whatsapp-business-by-brokers
// Cria o contato se não existir, ou atualiza se já existir.
// Usar para:
//   • Registrar o contato ao iniciar a triagem
//   • Definir o department_name → direciona para a fila correta de operadores
//   • Aplicar tags com o subfluxo detectado

export interface RdContactPayload {
  cel_phone: string;       // formato E.164 — obrigatório
  full_name: string;       // obrigatório
  integration: string;     // nome do chip WA — obrigatório
  department_name?: string;
  tags?: string[];
  email?: string;
  cpf?: string;
  cnpj?: string;
  workflow_title?: string;
  workflow_stage_title?: string;
  current_wallet?: string;
}

export async function createOrUpdateContact(payload: RdContactPayload): Promise<{ ok: boolean; contactId?: string }> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Upsert contato ${payload.full_name} (${payload.cel_phone})`);
    return { ok: true, contactId: `mock-${payload.cel_phone}` };
  }

  const integration = payload.integration || process.env.RD_CONVERSAS_INTEGRATION || "";

  const r = await rdJson("PUT", "/v2/contacts/whatsapp-business-by-brokers", {
    cel_phone: payload.cel_phone.replace(/\D/g, ""),
    full_name: payload.full_name,
    integration,
    ...(payload.department_name ? { department_name: payload.department_name } : {}),
    ...(payload.tags?.length ? { tags: payload.tags } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.cpf ? { cpf: payload.cpf } : {}),
    ...(payload.cnpj ? { cnpj: payload.cnpj } : {}),
    ...(payload.workflow_title ? { workflow_title: payload.workflow_title } : {}),
    ...(payload.workflow_stage_title ? { workflow_stage_title: payload.workflow_stage_title } : {}),
    ...(payload.current_wallet ? { current_wallet: payload.current_wallet } : {}),
  });

  if (r.ok) {
    return { ok: true, contactId: r.data?.data?._id };
  }

  console.error(`[RD Conversas] Falha ao upsert contato ${payload.cel_phone}:`, r.data);
  return { ok: false };
}

// ─── Encaminhar contato para fluxo ─── POST /v2/forward-to-customer ──────────
// Esta é a forma correta de "transferir" — coloca o contato em um fluxo interno
// do RD Conversas, que pode ser um fluxo de atendimento humano/departamento.
// O flowId deve ser o ID retornado por listFlows().

export async function forwardToFlow(
  contactId: string,
  flowId: string
): Promise<boolean> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Encaminhando ${contactId} para fluxo ${flowId}`);
    return true;
  }

  if (!flowId) {
    console.warn(`[RD Conversas] forwardToFlow: flowId não configurado — pulando encaminhamento.`);
    return false;
  }

  const r = await rdJson("POST", "/v2/forward-to-customer", {
    customer: contactId,
    flow: flowId,
  });

  if (r.ok) {
    console.log(`[RD Conversas] Contato ${contactId} encaminhado para fluxo ${flowId}`);
    return true;
  }

  console.error(`[RD Conversas] Falha ao encaminhar ${contactId}:`, r.data);
  return false;
}

// ─── Listar fluxos disponíveis ─── GET /v2/flows ─────────────────────────────

export async function listFlows(): Promise<RdFlow[]> {
  if (!RD_TOKEN) return [];

  const r = await rdJson("GET", "/v2/flows");
  if (!r.ok) return [];

  return (r.data?.flows ?? []).map((f: any) => ({
    id: f.id,
    title: f.title,
  }));
}

// ─── Listar funcionários / operadores ─── GET /v2/employees ──────────────────

export async function listEmployees(): Promise<RdEmployee[]> {
  if (!RD_TOKEN) return [];

  const r = await rdJson("GET", "/v2/employees");
  if (!r.ok) return [];

  return (r.data?.employees ?? []).map((e: any) => ({
    id: e.id,
    name: e.name,
    email: e.email,
  }));
}

// ─── Enviar template (mensagem pró-ativa) ─── POST /v3/messages/template/send
// Necessário para recontato após janela de 24h ou follow-up pró-ativo.
// O template precisa ser previamente aprovado pelo Meta dentro do RD Conversas.

export async function sendTemplate(
  recipientPhone: string,
  templateId: string,
  variables?: string[],
  options?: { sentBy?: "bot" | "operator"; operatorId?: string; countryCode?: string }
): Promise<RdSendResult> {
  if (!RD_TOKEN) {
    console.log(`[RD Conversas] MOCK — Template ${templateId} para ${recipientPhone}`);
    return { ok: true, messageId: `mock-tpl-${Date.now()}`, isMock: true };
  }

  const sanitized = recipientPhone.replace(/\D/g, "");

  const r = await rdJson("POST", "/v3/messages/template/send", {
    recipient_number: sanitized,
    template_message_id: templateId,
    sent_by: options?.sentBy ?? "bot",
    country_code: options?.countryCode ?? "55",
    ...(options?.sentBy === "operator" && options?.operatorId
      ? { operator_id: options.operatorId }
      : {}),
    ...(variables?.length ? { variables } : {}),
  });

  if (r.ok || r.status === 201) {
    return { ok: true, messageId: r.data?.data?.id };
  }

  console.error(`[RD Conversas] Falha ao enviar template para ${recipientPhone}:`, r.data);
  return { ok: false, error: JSON.stringify(r.data) };
}

// ─── Listar templates disponíveis ─── GET /v2/template/all ───────────────────

export async function listTemplates(): Promise<{ id: string; title: string; content: string }[]> {
  if (!RD_TOKEN) return [];

  const r = await rdJson("GET", "/v2/template/all");
  if (!r.ok) return [];

  return (r.data?.templates ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    content: t.content,
  }));
}

// ─── Verificação de token do webhook ─────────────────────────────────────────

export function validateWebhookToken(token: string): boolean {
  const expected = process.env.RD_CONVERSAS_WEBHOOK_TOKEN ?? "";
  if (!expected) {
    console.warn("[Webhook] RD_CONVERSAS_WEBHOOK_TOKEN não configurado — aceitando todos os webhooks (modo dev)");
    return true;
  }
  return token === expected;
}

// ─── Verificar se o serviço está configurado ──────────────────────────────────

export function isConfigured(): boolean {
  return !!RD_TOKEN;
}
