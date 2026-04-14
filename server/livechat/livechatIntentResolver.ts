/**
 * server/livechat/livechatIntentResolver.ts
 *
 * Resolve a intenção de navegação de um visitante a partir da URL.
 * Mapeia padrões do site Tecfag para tags semânticas de intenção.
 *
 * Tags de intenção:
 *  - maquinas_seladora   → Seladoras contínuas, automáticas, manuais
 *  - maquinas_geral      → Outras máquinas (envolvedoras, etc.)
 *  - pecas_reposicao     → Peças de reposição / componentes
 *  - pos_venda_suporte   → Suporte técnico, manutenção
 *  - orcamento_contato   → Pedido de orçamento, formulário de contato
 *  - checkout_compra     → Carrinho, checkout, pagamento
 *  - institucional       → Sobre a empresa, missão, parceiros
 *  - blog_conteudo       → Blog, artigos, notícias
 *  - navegacao_geral     → Páginas sem intenção específica identificada
 */

export interface PageIntent {
  tag: string;
  label: string;
  icon: string;
  scoreBoost: number; // Pontos adicionais para purchaseIntentScore
}

/** Mapeia uma URL para uma intenção de página */
export function resolvePageIntent(url: string): PageIntent {
  if (!url) return INTENT_GERAL;

  const u = url.toLowerCase();

  // ── Checkout / Compra (maior intenção de compra) ───────────────────────────
  if (u.includes('/checkout') || u.includes('/cart') || u.includes('/orderplaced') ||
      u.includes('/payment') || u.includes('/order')) {
    return { tag: 'checkout_compra', label: 'Checkout / Compra', icon: '🛒', scoreBoost: 40 };
  }

  // ── Contato / Orçamento ───────────────────────────────────────────────────
  if (u.includes('/contato') || u.includes('/orcamento') || u.includes('/solicitar') ||
      u.includes('/quote') || u.includes('/contact')) {
    return { tag: 'orcamento_contato', label: 'Contato / Orçamento', icon: '📋', scoreBoost: 30 };
  }

  // ── Seladoras (produto principal) ─────────────────────────────────────────
  if (u.includes('seladora') || u.includes('seladoras')) {
    // Seladoras automáticas / contínuas = maior intenção
    if (u.includes('automatica') || u.includes('continua') || u.includes('industrial') || u.includes('hp')) {
      return { tag: 'maquinas_seladora_premium', label: 'Seladora Automática/Contínua', icon: '🏭', scoreBoost: 25 };
    }
    return { tag: 'maquinas_seladora', label: 'Seladoras', icon: '⚙️', scoreBoost: 15 };
  }

  // ── Outras máquinas ───────────────────────────────────────────────────────
  if (u.includes('/maquina') || u.includes('/equipamento') || u.includes('/envolvedora') ||
      u.includes('/termoretratil') || u.includes('/seladora') || u.includes('/datador') ||
      u.includes('/fatiador') || u.includes('/cortadora') || u.includes('/produto')) {
    return { tag: 'maquinas_geral', label: 'Máquinas / Equipamentos', icon: '🔧', scoreBoost: 15 };
  }

  // ── Peças de reposição ────────────────────────────────────────────────────
  if (u.includes('/peca') || u.includes('/peça') || u.includes('/componente') ||
      u.includes('/reposicao') || u.includes('/resistencia') || u.includes('/faca') ||
      u.includes('/borracha') || u.includes('/mola') || u.includes('/correia')) {
    return { tag: 'pecas_reposicao', label: 'Peças / Reposição', icon: '🔩', scoreBoost: 20 };
  }

  // ── Pós-venda / Suporte ───────────────────────────────────────────────────
  if (u.includes('/suporte') || u.includes('/assistencia') || u.includes('/manutencao') ||
      u.includes('/pos-venda') || u.includes('/pos_venda') || u.includes('/garantia') ||
      u.includes('/manual') || u.includes('/tutorial')) {
    return { tag: 'pos_venda_suporte', label: 'Suporte / Pós-Venda', icon: '🛠️', scoreBoost: 10 };
  }

  // ── Institucional ─────────────────────────────────────────────────────────
  if (u.includes('/sobre') || u.includes('/about') || u.includes('/empresa') ||
      u.includes('/quem-somos') || u.includes('/missao') || u.includes('/historia') ||
      u.includes('/parceiro') || u.includes('/representante')) {
    return { tag: 'institucional', label: 'Institucional', icon: '🏢', scoreBoost: 2 };
  }

  // ── Blog / Conteúdo ───────────────────────────────────────────────────────
  if (u.includes('/blog') || u.includes('/artigo') || u.includes('/noticias') ||
      u.includes('/dica') || u.includes('/como-') || u.includes('/guia')) {
    return { tag: 'blog_conteudo', label: 'Conteúdo / Blog', icon: '📰', scoreBoost: 5 };
  }

  return INTENT_GERAL;
}

const INTENT_GERAL: PageIntent = {
  tag: 'navegacao_geral',
  label: 'Navegação Geral',
  icon: '🌐',
  scoreBoost: 1,
};

/** Agrupa um array de intentTags e retorna contagem por intenção */
export function aggregateIntents(intentTags: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tag of intentTags) {
    if (!tag || tag === 'navegacao_geral') continue;
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

/** Retorna label + icon para um intentTag */
export function getIntentMeta(tag: string): { label: string; icon: string } {
  const TAG_META: Record<string, { label: string; icon: string }> = {
    maquinas_seladora_premium: { label: 'Seladora Auto/Contínua', icon: '🏭' },
    maquinas_seladora: { label: 'Seladoras', icon: '⚙️' },
    maquinas_geral: { label: 'Máquinas', icon: '🔧' },
    pecas_reposicao: { label: 'Peças', icon: '🔩' },
    pos_venda_suporte: { label: 'Suporte', icon: '🛠️' },
    orcamento_contato: { label: 'Orçamento', icon: '📋' },
    checkout_compra: { label: 'Checkout', icon: '🛒' },
    institucional: { label: 'Institucional', icon: '🏢' },
    blog_conteudo: { label: 'Blog', icon: '📰' },
    navegacao_geral: { label: 'Geral', icon: '🌐' },
  };
  return TAG_META[tag] ?? { label: tag, icon: '❓' };
}
