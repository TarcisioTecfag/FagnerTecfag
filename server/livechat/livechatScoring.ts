/**
 * server/livechat/livechatScoring.ts
 *
 * Sistema de categorização e score de engajamento dos visitantes
 */

import { lcStorage } from "./livechatStorage.js";
import type { LcVisitor } from "../../shared/schema.js";

// ─── Score rules ──────────────────────────────────────────────────────────────
//
// Ação                         | Pontos
// Visitou o site               |  +5
// Cada página vista            |  +2
// Ficou mais de 3 min          | +10
// Iniciou chat                 | +20
// Voltou ao site               | +15
// Viu página de contato        | +30
//

// ─── Category rules ──────────────────────────────────────────────────────────
//
// Lead Quente: score >= 60 OU (3+ páginas E chat iniciado)
// Lead Morno:  score >= 30 OU (2+ visitas E viu contato)
// Cliente:     teve chat com Fagner (WhatsApp ou site)
// Retorno:     2+ visitas
// Visitante:   padrão (primeira visita, sem interação)
//

export function calculateCategory(visitor: LcVisitor): string {
  const score = visitor.engagementScore ?? 0;
  const pages = visitor.totalPages ?? 0;
  const chats = visitor.totalChats ?? 0;
  const visits = visitor.totalVisits ?? 1;

  // Lead Quente
  if (score >= 60 || (pages >= 3 && chats >= 1)) {
    return "lead_hot";
  }

  // Cliente (tem chat)
  if (chats >= 1) {
    return "customer";
  }

  // Retorno
  if (visits >= 2) {
    return "returning";
  }

  // Lead Morno
  if (score >= 30 || visits >= 2) {
    return "lead_warm";
  }

  return "visitor";
}

// ─── Recalculate and persist ──────────────────────────────────────────────────

export async function recalculateVisitorCategory(visitorId: string): Promise<void> {
  const visitor = await lcStorage.getVisitorById(visitorId);
  if (!visitor) return;

  const newCategory = calculateCategory(visitor);
  if (newCategory !== visitor.category) {
    await lcStorage.updateVisitor(visitorId, { category: newCategory });
  }
}
