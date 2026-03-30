// server/fagner/vtexService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Integração VTEX Autenticada — Busca de Produtos, Simulação de Frete
// Usa VTEX_APP_KEY + VTEX_APP_TOKEN para acesso confiável às APIs
// ═══════════════════════════════════════════════════════════════════════════════

import { storage } from "../storage.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const VTEX_ACCOUNT = process.env.VTEX_ACCOUNT_NAME || "tecfag";
const VTEX_API_BASE = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
const VTEX_STORE_URL = "https://www.tecfag.com.br";

function vtexHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-VTEX-API-AppKey": process.env.VTEX_APP_KEY || "",
    "X-VTEX-API-AppToken": process.env.VTEX_APP_TOKEN || "",
  };
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VtexProduct {
  found: true;
  productName: string;
  productId: string;
  skuId: string;
  link: string;
  price: number | null;
  priceFormatted: string;
  available: boolean;
  category: string;
  description: string;
  imageUrl: string | null;
}

export interface VtexNotFound {
  found: false;
  query: string;
  normalizedQuery: string;
}

export type VtexResult = VtexProduct | VtexNotFound;

export interface ShippingOption {
  carrier: string;
  deliveryDays: number;
  price: number;
  priceFormatted: string;
}

export interface ShippingResult {
  success: boolean;
  cep: string;
  options: ShippingOption[];
  error?: string;
}

// ─── Levenshtein fuzzy para normalização local ────────────────────────────────

function fuzzyScore(a: string, b: string): number {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

// ─── Aplica sinônimos do banco ────────────────────────────────────────────────

async function applySynonyms(query: string): Promise<string> {
  try {
    const synonyms = await storage.listVtexSynonyms();
    let best = { score: 0, canonical: query };
    const q = query.toLowerCase();

    for (const s of synonyms) {
      if (q.includes(s.term.toLowerCase()) || s.term.toLowerCase().includes(q)) {
        return s.canonical;
      }
      const score = fuzzyScore(q, s.term.toLowerCase());
      if (score > best.score && score > 0.6) {
        best = { score, canonical: s.canonical };
      }
    }

    return best.score > 0.6 ? best.canonical : query;
  } catch {
    return query;
  }
}

// ─── Formata preço ────────────────────────────────────────────────────────────

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return "Consulte";
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Extrai dados do produto da resposta da VTEX ──────────────────────────────

function parseProduct(p: any, normalizedQuery: string): VtexProduct | null {
  if (!p) return null;
  const item = p.items?.[0];
  const seller = item?.sellers?.[0]?.commertialOffer;
  const price = seller?.Price ?? null;
  const avail = (seller?.AvailableQuantity ?? 0) > 0;
  const imgUrl = item?.images?.[0]?.imageUrl ?? null;
  const productName = p.productName ?? p.productTitle ?? normalizedQuery;
  const skuId = item?.itemId ?? "";

  return {
    found: true,
    productName,
    productId: p.productId ?? "",
    skuId,
    link: `${VTEX_STORE_URL}/${p.linkText}/p`,
    price,
    priceFormatted: formatPrice(price),
    available: avail,
    category: p.categories?.[0]?.replace(/^\//g, "").split("/").pop() ?? "",
    description: (p.description ?? "").slice(0, 300),
    imageUrl: imgUrl,
  };
}

// ─── Busca principal — 3 estratégias de fallback ──────────────────────────────

export async function searchProduct(rawQuery: string): Promise<VtexResult> {
  const normalizedQuery = await applySynonyms(rawQuery.trim());

  try {
    await storage.createVtexLog({
      type: "search",
      description: `Buscou "${rawQuery}"${rawQuery !== normalizedQuery ? ` → normalizado: "${normalizedQuery}"` : ""}`,
      autonomous: true,
    });
  } catch {}

  // ── Estratégia 1: API autenticada com full-text search ──
  try {
    const url1 = `${VTEX_API_BASE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(normalizedQuery)}&_from=0&_to=9`;
    const res1 = await fetch(url1, {
      headers: vtexHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (res1.ok) {
      const products: any[] = await res1.json();
      if (products.length > 0) {
        // Tenta match exato no nome primeiro
        const exactMatch = products.find((p: any) =>
          p.productName?.toLowerCase().includes(normalizedQuery.toLowerCase())
        );
        const product = parseProduct(exactMatch || products[0], normalizedQuery);
        if (product) {
          await logFound(product);
          return product;
        }
      }
    }
  } catch (e: any) {
    console.warn("[VTEX] Estratégia 1 falhou:", e.message);
  }

  // ── Estratégia 2: Busca por termo no catálogo (fq=ft:term) ──
  try {
    const url2 = `${VTEX_API_BASE}/api/catalog_system/pub/products/search?fq=ft:${encodeURIComponent(normalizedQuery)}&_from=0&_to=9`;
    const res2 = await fetch(url2, {
      headers: vtexHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (res2.ok) {
      const products: any[] = await res2.json();
      if (products.length > 0) {
        const product = parseProduct(products[0], normalizedQuery);
        if (product) {
          await logFound(product);
          return product;
        }
      }
    }
  } catch (e: any) {
    console.warn("[VTEX] Estratégia 2 falhou:", e.message);
  }

  // ── Estratégia 3: API pública do storefront (fallback sem auth) ──
  try {
    const url3 = `${VTEX_STORE_URL}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(normalizedQuery)}&_from=0&_to=9`;
    const res3 = await fetch(url3, {
      headers: { "Accept": "application/json", "User-Agent": "TecfagBot/1.0" },
      signal: AbortSignal.timeout(8_000),
    });

    if (res3.ok) {
      const products: any[] = await res3.json();
      if (products.length > 0) {
        const product = parseProduct(products[0], normalizedQuery);
        if (product) {
          await logFound(product);
          return product;
        }
      }
    }
  } catch (e: any) {
    console.warn("[VTEX] Estratégia 3 (fallback) falhou:", e.message);
  }

  // Nenhuma estratégia encontrou
  await storage.createVtexLog({ type: "not_found", description: "Produto não encontrado no catálogo" }).catch(() => {});
  await storage.createVtexFailure({ query: rawQuery, reason: "Não encontrado em 3 estratégias" }).catch(() => {});
  return { found: false, query: rawQuery, normalizedQuery };
}

async function logFound(product: VtexProduct): Promise<void> {
  await storage.createVtexLog({
    type: "found",
    description: product.available ? "Encontrou produto — disponível" : "Encontrou produto — indisponível",
    product: product.productName,
  }).catch(() => {});
}

// ─── Detecta intenção de busca por máquina na mensagem do cliente ─────────────

const MACHINE_KEYWORDS = [
  "envasadora", "seladora", "rotuladora", "empacotadora", "rosqueadeira",
  "tampadora", "dosadora", "encapsuladora", "embaladora", "ensacadora",
  "etiquetadora", "labeladora", "datadora", "inkjet", "fechadora",
  "recravadeira", "roscadora", "injetora", "extrusora", "misturador",
  "arlm", "arl-", "sleeve", "shrink",
];

const MACHINE_INTENT_PATTERNS = [
  /(?:preciso|quero|busco|procuro|tenho interesse|gostaria)\s+(?:de\s+)?(?:uma?|comprar)?\s*(?:máquina|envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira)/i,
  /(?:tem|vende[m]?|possui|trabalha[m]?\s+com|catálogo|catalogo).*?(?:envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira|máquina)/i,
  /(?:envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira)/i,
  /máquina\s+(?:de\s+)?(?:embalar|selar|envasar|rotular|tampas?|dose?|encapsular|ensacar)/i,
  /equipamento\s+(?:de|para)\s+(?:envase?|selagem|rotulagem)/i,
  // Modelos específicos: ARLM-200, ARL-200A, etc
  /\b(?:arlm|arl)[- ]?\d+[a-z]*/i,
];

export function detectMachineIntent(message: string): string | null {
  const m = message.toLowerCase();

  // Primeiro: modelos específicos (ex: ARLM-200A)
  const modelMatch = m.match(/\b(?:arlm|arl)[- ]?\d+[a-z]*/i);
  if (modelMatch) return modelMatch[0].trim();

  // Segundo: palavras-chave de máquinas
  for (const kw of MACHINE_KEYWORDS) {
    if (m.includes(kw)) {
      return kw;
    }
  }

  // Terceiro: padrões mais complexos
  for (const pattern of MACHINE_INTENT_PATTERNS) {
    if (pattern.test(m)) {
      const match = pattern.exec(m);
      return match ? match[0].trim() : message.trim();
    }
  }
  return null;
}

// ─── Detecta intenção de cálculo de frete ────────────────────────────────────

const SHIPPING_PATTERNS = [
  /(?:quanto|calcul|simul|consult).*(?:frete|entrega|envio|fret)/i,
  /frete\s+(?:para|pro|pra|do|da|até)/i,
  /(?:valor|preço|custo).*(?:frete|entrega|envio)/i,
  /(?:prazo|demora|tempo).*(?:entrega|chegar|receber)/i,
  /\b(?:frete|entrega|envio)\b.*\b\d{5}[- ]?\d{3}\b/i,
  /\b\d{5}[- ]?\d{3}\b.*\b(?:frete|entrega|envio)\b/i,
];

const CEP_REGEX = /\b(\d{5})[- ]?(\d{3})\b/;

export function detectShippingIntent(message: string): { wantsFrete: boolean; cep: string | null } {
  const wantsFrete = SHIPPING_PATTERNS.some((p) => p.test(message));
  const cepMatch = message.match(CEP_REGEX);
  const cep = cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : null;
  return { wantsFrete, cep };
}

// ─── Formata resultado da busca para contexto do Gemini ───────────────────────

export function formatVtexContextForGemini(result: VtexResult): string {
  if (!result.found) {
    return `## BUSCA VTEX — TECFAG.COM.BR
Produto "${result.normalizedQuery}" não foi localizado no catálogo online neste momento.
IMPORTANTE: Isso NÃO significa que a Tecfag não possui. A Tecfag trabalha com uma ampla linha de máquinas e soluções.
NUNCA diga ao cliente que "não tem link", "não localizou" ou "não encontrou". Em vez disso, confirme que a Tecfag trabalha com esse tipo de solução e continue coletando informações do cliente normalmente, seguindo o fluxo de vendas.`;
  }

  const status = result.available
    ? "✅ DISPONÍVEL em estoque"
    : "⚠️ INDISPONÍVEL no momento";

  return `## BUSCA VTEX — TECFAG.COM.BR
✅ Produto encontrado no catálogo da Tecfag!

**Produto:** ${result.productName}
**SKU ID:** ${result.skuId}
**Status:** ${status}
**Preço:** ${result.priceFormatted}
**Categoria:** ${result.category}
**Link direto:** ${result.link}
${result.description ? `**Descrição:** ${result.description}` : ""}

INSTRUÇÃO: Informe o cliente sobre este produto. Se disponível, envie o link acima de forma natural na conversa. Se o cliente demonstrar interesse em comprar, pergunte se deseja calcular o frete (peça o CEP).`;
}

// ─── Simulação de Frete via API VTEX ─────────────────────────────────────────

/**
 * Simula frete para um SKU + CEP via API da VTEX
 * Endpoint: POST /api/checkout/pub/orderForms/simulation
 */
export async function simulateShipping(
  cep: string,
  skuId: string,
  quantity: number = 1
): Promise<ShippingResult> {
  const cleanCep = cep.replace(/\D/g, "");
  if (cleanCep.length !== 8) {
    return { success: false, cep: cleanCep, options: [], error: "CEP inválido (deve ter 8 dígitos)" };
  }

  if (!skuId) {
    return { success: false, cep: cleanCep, options: [], error: "SKU não identificado — pergunte qual produto" };
  }

  const url = `${VTEX_API_BASE}/api/checkout/pub/orderForms/simulation`;

  const body = {
    items: [{ id: skuId, quantity, seller: "1" }],
    postalCode: cleanCep,
    country: "BRA",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: vtexHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[VTEX Frete] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return { success: false, cep: cleanCep, options: [], error: `Erro HTTP ${res.status}` };
    }

    const data = await res.json();
    const logisticsInfo = data?.logisticsInfo?.[0]?.slas ?? [];

    const options: ShippingOption[] = logisticsInfo
      .filter((sla: any) => sla.price !== undefined)
      .map((sla: any) => ({
        carrier: sla.name || sla.id || "Transportadora",
        deliveryDays: sla.shippingEstimate
          ? parseInt(sla.shippingEstimate.replace(/\D/g, ""), 10) || 0
          : 0,
        price: (sla.price ?? 0) / 100,
        priceFormatted: ((sla.price ?? 0) / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
      }))
      .sort((a: ShippingOption, b: ShippingOption) => a.price - b.price);

    await storage.createVtexLog({
      type: "shipping_simulation",
      description: `Frete CEP ${cleanCep}: ${options.length} opções encontradas`,
      autonomous: true,
    }).catch(() => {});

    return { success: true, cep: cleanCep, options };
  } catch (err: any) {
    console.error(`[VTEX Frete] Erro:`, err.message);
    return { success: false, cep: cleanCep, options: [], error: err.message };
  }
}

/**
 * Formata resultado do frete para injeção no contexto do Gemini
 */
export function formatShippingForGemini(result: ShippingResult): string {
  if (!result.success) {
    return `## SIMULAÇÃO DE FRETE
❌ Não foi possível calcular o frete para o CEP ${result.cep}.
Motivo: ${result.error}
INSTRUÇÃO: Informe o cliente que houve um problema ao consultar o frete e peça para tentar novamente ou sugerir que informe outro CEP.`;
  }

  if (result.options.length === 0) {
    return `## SIMULAÇÃO DE FRETE
⚠️ Nenhuma opção de entrega encontrada para o CEP ${result.cep}.
INSTRUÇÃO: Informe ao cliente que não encontramos opções de entrega para essa região no momento e sugira contato com a equipe comercial para alternativas.`;
  }

  const optionsTable = result.options
    .slice(0, 5)
    .map((opt, i) =>
      `${i + 1}. **${opt.carrier}** — ${opt.priceFormatted} (${opt.deliveryDays} dias úteis)`
    )
    .join("\n");

  return `## SIMULAÇÃO DE FRETE — CEP ${result.cep}
✅ Frete calculado com sucesso!

${optionsTable}

INSTRUÇÃO: Apresente as opções ao cliente de forma amigável. Destaque a mais econômica e a mais rápida. Se quiser comprar, ofereça ajuda para finalizar.`;
}
