// server/fagner/followUpService.ts
// Follow-up por inatividade e gerenciamento de pausa de sessão

import { ContactSession } from "./sessionManager.js";
import { sendMessage } from "./rdConversasService.js";

const FOLLOW_UP_MS   = 5  * 60_000; // 5 minutos sem resposta → follow-up
const PAUSE_MS       = 10 * 60_000; // 10 minutos após follow-up → pausa
const ABANDON_CLOSE_MS = 20 * 60_000; // 20 minutos de inatividade total → fechar com dados parciais

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
 * Verifica todas as sessões ativas e envia follow-up ou pausa conforme
 * o tempo desde a última mensagem.
 * Também aciona o fechamento por abandono quando o cliente tem telefone
 * e ficou mais de 20 minutos sem responder.
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

    // ── FECHAMENTO POR ABANDONO ───────────────────────────────────────────────
    // Se o cliente forneceu telefone mas ficou 20+ min sem responder,
    // cria o card com os dados parciais e fecha a sessão.
    if (
      sinceLastMsg >= ABANDON_CLOSE_MS &&
      session.flowData.clientPhone &&
      _forceCloseSession
    ) {
      console.log(`[FollowUp] Sessão ${session.contactId} — abandono detectado (telefone coletado, 20min sem resposta). Fechando com dados parciais.`);
      await _forceCloseSession(session, "inatividade de 20 minutos com telefone coletado").catch((e) =>
        console.error(`[FollowUp] Erro em forceCloseSession para ${session.contactId}:`, e)
      );
      continue;
    }

    // ≥ 10 min após follow-up → pausa a sessão
    if (
      session.followUpCount >= 1 &&
      session.followUpSentAt &&
      now - session.followUpSentAt.getTime() >= PAUSE_MS
    ) {
      session.isPaused = true;
      console.log(`[FollowUp] Sessão ${session.contactId} pausada por inatividade.`);
      continue;
    }

    // ≥ 5 min sem resposta e ainda não enviou follow-up
    if (sinceLastMsg >= FOLLOW_UP_MS && session.followUpCount === 0) {
      try {
        const msg = randomFollowUp();
        await sendMessage(session.contactId, msg);
        session.followUpCount++;
        session.followUpSentAt = new Date();
        console.log(`[FollowUp] Follow-up enviado para ${session.contactId}`);
      } catch (err) {
        console.error(`[FollowUp] Erro ao enviar follow-up para ${session.contactId}:`, err);
      }
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
