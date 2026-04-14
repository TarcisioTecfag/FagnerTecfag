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

// ─── Purchase Intent Score (#4) ───────────────────────────────────────────────
//
// Regras de pontuação por intenção (acumulativas, capped em 100):
//  - Visitou /checkout                       → +40
//  - Visitou /contato ou /orcamento           → +30
//  - Visitou página de produto premium 2x+   → +25
//  - Retornou ao site no mesmo dia           → +20
//  - Ficou mais de 2 min em página de produto → +5 (via WS a cada PAGEVIEW_UPDATE)
//
// Nota: a maioria dos pontos é acumulada em tempo real via PAGE_UPDATE no WS.
// Essa função recalcula o score total com base no histórico de pageviews.
//

export function calculatePurchaseIntent(
  visitor: LcVisitor,
  recentIntentTags: string[]
): number {
  let score = 0;

  // Checkout = intenção máxima
  if (recentIntentTags.includes("checkout_compra")) score += 40;

  // Contato / orçamento
  if (recentIntentTags.includes("orcamento_contato")) score += 30;

  // Máquinas premium (produto principal)
  const premiumCount = recentIntentTags.filter(t => t === "maquinas_seladora_premium").length;
  if (premiumCount >= 2) score += 25;
  else if (premiumCount >= 1) score += 15;

  // Peças (alta intenção transacional)
  if (recentIntentTags.includes("pecas_reposicao")) score += 20;

  // Retorno ao site (já captado em totalVisits)
  if ((visitor.totalVisits ?? 1) >= 2) score += 20;

  // Bônus por múltiplos chats (cliente recorrente)
  if ((visitor.totalChats ?? 0) >= 2) score += 15;

  return Math.min(score, 100);
}

export async function recalculatePurchaseIntent(visitorId: string): Promise<void> {
  const visitor = await lcStorage.getVisitorById(visitorId);
  if (!visitor) return;

  const pageviews = await lcStorage.listPageviewsByVisitor(visitorId, 50);
  const intentTags = pageviews.map(pv => (pv as any).intentTag).filter(Boolean) as string[];

  const newScore = calculatePurchaseIntent(visitor, intentTags);
  await lcStorage.updatePurchaseIntentScore(visitorId, newScore);
}
