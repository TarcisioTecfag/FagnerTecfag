// server/fagner/followUpService.ts
// Follow-up por inatividade e gerenciamento de pausa de sessão

import { ContactSession } from "./sessionManager.js";
import { sendMessage } from "./rdConversasService.js";

// 5 minutos sem resposta → assume confirmação, envia mensagem e cria o card no CRM
const ABANDON_CLOSE_MS = 5 * 60_000;
// Fallback de pausa: sessões sem telefone ainda aguardam até o operador pegar
const PAUSE_MS = 10 * 60_000;

// Importado dinamicamente para evitar dependência circular
let _forceCloseSession: ((session: ContactSession, reason: string) => Promise<void>) | null = null;

export function setForceCloseSession(fn: (session: ContactSession, reason: string) => Promise<void>) {
  _forceCloseSession = fn;
}

const FOLLOW_UP_MESSAGES = [
  "Oi, ainda estou por aqui! Posso te ajudar com mais alguma coisa? 😊",
  "Olá! Ficou alguma dúvida? Estou aqui para ajudar!",
  "Oi! Tudo bem? Me avise se precisar de algo mais.",
  "Ainda está aí? Fico à disposição se precisar de mais informações!",
  "Oi! Só queria confirmar se consegui te ajudar com tudo 😊",
];

function randomFollowUp(): string {
  return FOLLOW_UP_MESSAGES[Math.floor(Math.random() * FOLLOW_UP_MESSAGES.length)];
}

/**
 * Verifica todas as sessões ativas a cada 60s.
 * Comportamento após 5 minutos de silêncio:
 *   - Se o cliente tem telefone (contactPhone ou flowData.clientPhone):
 *     → Fagner assume confirmação, envia mensagem de encerramento e cria o card no CRM.
 *   - Sem telefone: pausa a sessão após 10 min.
 */
export async function checkFollowUps(activeSessions: ContactSession[]): Promise<void> {
  const now = Date.now();

  for (const session of activeSessions) {
    if (session.isCompleted || session.isProcessing) continue;

    const sinceLastMsg = now - session.lastMessageAt.getTime();

    // Sessão pausada: aguarda cliente responder (reativação via webhook)
    if (session.isPaused) continue;

    // ── SAFEGUARD: se já foi atribuído operador, o atendimento foi transferido.
    // Marca como pausado para evitar follow-up indesejado caso isCompleted
    // não tenha sido setado (ex: Gemini usou frase de encerramento diferente do padrão).
    if (session.assignedOperator) {
      session.isPaused = true;
      console.log(`[FollowUp] Sessão ${session.contactId} pausada — operador já atribuído (${session.assignedOperator}), follow-up bloqueado.`);
      continue;
    }

    // ── FECHAMENTO POR ABANDONO (5 minutos) ──────────────────────────────────
    // Se o cliente tem telefone e ficou 5+ min sem responder:
    // Fagner assume que está correto, envia mensagem de encerramento e cria o card.
    // Cobre AMBOS os campos de telefone:
    //   - flowData.clientPhone: digitado pelo cliente na conversa
    //   - contactPhone: capturado automaticamente do RD Conversas/WhatsApp
    const hasPhone = !!(session.flowData.clientPhone || session.contactPhone);
    if (
      sinceLastMsg >= ABANDON_CLOSE_MS &&
      hasPhone &&
      _forceCloseSession
    ) {
      console.log(`[FollowUp] Sessão ${session.contactId} — 5min sem resposta com telefone coletado → assumindo confirmação.`);
      await _forceCloseSession(session, "5 minutos sem resposta — assumindo confirmação do cliente").catch((e) =>
        console.error(`[FollowUp] Erro em forceCloseSession para ${session.contactId}:`, e)
      );
      continue;
    }

    // ── SEM TELEFONE: pausa após 10 min de inatividade ────────────────────────
    // Sessões sem telefone (cliente sumiu antes de se identificar) ficam pausadas
    // aguardando o cliente retornar. Sem follow-up agressivo.
    if (sinceLastMsg >= PAUSE_MS && !hasPhone) {
      session.isPaused = true;
      console.log(`[FollowUp] Sessão ${session.contactId} pausada — sem telefone coletado após 10min.`);
      continue;
    }
  }
}

/**
 * Reativa uma sessão pausada quando o cliente responde.
 */
export function reactivateSession(session: ContactSession): boolean {
  if (session.isPaused) {
    session.isPaused = false;
    session.followUpCount = 0;
    session.followUpSentAt = null;
    session.lastMessageAt = new Date();
    console.log(`[FollowUp] Sessão ${session.contactId} reativada.`);
    return true;
  }
  return false;
}
