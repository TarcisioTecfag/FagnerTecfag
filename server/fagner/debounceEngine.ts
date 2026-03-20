// server/fagner/debounceEngine.ts
// Acumulação e debounce de mensagens rápidas (15s timer, anti-flood 50 msgs)

import { ContactSession, addToHistory } from "./sessionManager.js";

const DEBOUNCE_MS = 15_000;   // 15 segundos
const MAX_BUFFER  = 50;        // anti-flood

type ProcessFn = (session: ContactSession, combinedMessage: string) => Promise<void>;

/**
 * Adiciona uma mensagem ao buffer da sessão e (re)inicia o timer de debounce.
 * Quando o timer expira (ou o buffer atinge MAX_BUFFER), chama processFn
 * com a mensagem combinada.
 */
export function enqueueMessage(
  session: ContactSession,
  message: string,
  processFn: ProcessFn
): void {
  // Adiciona ao histórico imediatamente
  addToHistory(session, message);

  // Adiciona ao buffer de debounce
  session.messageBuffer.push(message);

  // Cancela timer anterior se existir
  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
    session.debounceTimer = null;
  }

  // Anti-flood: se buffer cheio, dispara imediatamente
  if (session.messageBuffer.length >= MAX_BUFFER) {
    fireBuffer(session, processFn);
    return;
  }

  // Agenda disparo após DEBOUNCE_MS
  session.debounceTimer = setTimeout(() => {
    fireBuffer(session, processFn);
  }, DEBOUNCE_MS);
}

function fireBuffer(session: ContactSession, processFn: ProcessFn): void {
  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
    session.debounceTimer = null;
  }

  if (session.messageBuffer.length === 0) return;

  // Combina todas as mensagens acumuladas
  const combined = session.messageBuffer.join("\n").trim();
  session.messageBuffer = [];

  // Não processa se a sessão já está completa
  if (session.isCompleted) return;

  // Não processa se já está em processamento (mutex simples)
  if (session.isProcessing) {
    console.warn(`[Debounce] Sessão ${session.contactId} já em processamento — pulando.`);
    return;
  }

  processFn(session, combined).catch((err) => {
    console.error(`[Debounce] Erro ao processar sessão ${session.contactId}:`, err);
    session.isProcessing = false;
  });
}

/**
 * Cancela qualquer timer pendente e limpa o buffer de uma sessão.
 * Usado ao finalizar/pausar o atendimento.
 */
export function cancelDebounce(session: ContactSession): void {
  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
    session.debounceTimer = null;
  }
  session.messageBuffer = [];
}
