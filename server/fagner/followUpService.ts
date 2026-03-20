// server/fagner/followUpService.ts
// Follow-up por inatividade e gerenciamento de pausa de sessão

import { ContactSession } from "./sessionManager.js";
import { sendMessage } from "./rdConversasService.js";

const FOLLOW_UP_MS   = 5  * 60_000; // 5 minutos sem resposta → follow-up
const PAUSE_MS       = 10 * 60_000; // 10 minutos após follow-up → pausa

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
 */
export async function checkFollowUps(activeSessions: ContactSession[]): Promise<void> {
  const now = Date.now();

  for (const session of activeSessions) {
    if (session.isCompleted || session.isProcessing) continue;

    const sinceLastMsg = now - session.lastMessageAt.getTime();

    // Sessão pausada: aguarda cliente responder (reativação via webhook)
    if (session.isPaused) continue;

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
