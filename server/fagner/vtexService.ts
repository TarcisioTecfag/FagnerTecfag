// server/fagner/vtexService.ts
// Integração com a API de catálogo pública da VTEX (tecfag.com.br)
// - Normaliza a busca aplicando sinônimos do banco (PostgreSQL via storage)
// - Chama /api/catalog_system/pub/products/search
// - Retorna produto formatado ou { found: false }

import { storage } from "../storage.js";

const VTEX_BASE = "https://www.tecfag.com.br";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VtexProduct {
  found: true;
  productName: string;
  productId: string;
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
      // Correspondência exata tem score 1.0
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

// ─── Busca principal na VTEX ──────────────────────────────────────────────────

export async function searchProduct(
  rawQuery: string
): Promise<VtexResult> {
  const normalizedQuery = await applySynonyms(rawQuery.trim());
  const encodedQuery = encodeURIComponent(normalizedQuery);

  try {
    await storage.createVtexLog({ type: "search", description: `Buscou "${rawQuery}"`, autonomous: true });
  } catch {}

  const url = `${VTEX_BASE}/api/catalog_system/pub/products/search?fq=ft:${encodedQuery}&_from=0&_to=5`;

  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "TecfagBot/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.warn(`[VTEX] HTTP ${res.status} para query "${normalizedQuery}"`);
      await storage.createVtexLog({ type: "not_found", description: "Produto não encontrado no catálogo" }).catch(() => {});
      await storage.createVtexFailure({ query: rawQuery, reason: "HTTP " + res.status }).catch(() => {});
      return { found: false, query: rawQuery, normalizedQuery };
    }

    const products: any[] = await res.json();

    if (!Array.isArray(products) || products.length === 0) {
      await storage.createVtexLog({ type: "not_found", description: "Produto não encontrado no catálogo" }).catch(() => {});
      await storage.createVtexFailure({ query: rawQuery, reason: "Não mapeado" }).catch(() => {});
      return { found: false, query: rawQuery, normalizedQuery };
    }

    const p = products[0];
    const item    = p.items?.[0];
    const seller  = item?.sellers?.[0]?.commertialOffer;
    const price   = seller?.Price ?? null;
    const avail   = (seller?.AvailableQuantity ?? 0) > 0;
    const imgUrl  = item?.images?.[0]?.imageUrl ?? null;
    const productName = p.productName ?? p.productTitle ?? normalizedQuery;

    await storage.createVtexLog({ type: "found", description: avail ? "Encontrou produto — disponível" : "Encontrou produto — indisponível", product: productName }).catch(() => {});

    return {
      found:          true,
      productName,
      productId:      p.productId ?? "",
      link:           `${VTEX_BASE}/${p.linkText}/p`,
      price,
      priceFormatted: formatPrice(price),
      available:      avail,
      category:       p.categories?.[0]?.replace(/^\//g, "").split("/").pop() ?? "",
      description:    (p.description ?? "").slice(0, 300),
      imageUrl:       imgUrl,
    };
  } catch (err: any) {
    console.error(`[VTEX] Erro ao buscar "${normalizedQuery}":`, err.message);
    await storage.createVtexLog({ type: "not_found", description: "Falha na comunicação com catálogo" }).catch(() => {});
    await storage.createVtexFailure({ query: rawQuery, reason: "Erro API" }).catch(() => {});
    return { found: false, query: rawQuery, normalizedQuery };
  }
}

// ─── Detecta intenção de busca por máquina na mensagem do cliente ─────────────

// Palavras-chave de máquinas/equipamentos da Tecfag
const MACHINE_KEYWORDS = [
  "envasadora", "seladora", "rotuladora", "empacotadora", "rosqueadeira",
  "tampadora", "dosadora", "encapsuladora", "embaladora", "ensacadora",
  "etiquetadora", "labeladora", "datadora", "inkjet", "fechadora",
  "recravadeira", "roscadora", "injetora", "extrusora", "misturador",
];

const MACHINE_INTENT_PATTERNS = [
  // "preciso de uma seladora", "quero comprar envasadora"
  /(?:preciso|quero|busco|procuro|tenho interesse|gostaria)\s+(?:de\s+)?(?:uma?|comprar)?\s*(?:máquina|envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira)/i,
  // "voce tem seladora", "tem envasadora no catalogo", "vende seladora"
  /(?:tem|vende[m]?|possui|trabalha[m]?\s+com|catálogo|catalogo).*?(?:envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira|máquina)/i,
  // Palavra-chave isolada (ex: "seladora" pura na frase)
  /(?:envasadora|seladora|rotuladora|empacotadora|rosqueadeira|tampadora|dosadora|encapsuladora|embaladora|ensacadora|etiquetadora|labeladora|datadora|fechadora|recravadeira)/i,
  // "máquina de embalar/selar/envasar"
  /máquina\s+(?:de\s+)?(?:embalar|selar|envasar|rotular|tampas?|dose?|encapsular|ensacar)/i,
  // "equipamento de envase"
  /equipamento\s+(?:de|para)\s+(?:envase?|selagem|rotulagem)/i,
];

export function detectMachineIntent(message: string): string | null {
  const m = message.toLowerCase();

  // Primeiro, tenta encontrar uma palavra-chave de máquina diretamente na mensagem
  for (const kw of MACHINE_KEYWORDS) {
    if (m.includes(kw)) {
      return kw; // Retorna a keyword limpa (ex: "seladora")
    }
  }

  // Fallback: padrões mais complexos
  for (const pattern of MACHINE_INTENT_PATTERNS) {
    if (pattern.test(m)) {
      const match = pattern.exec(m);
      return match ? match[0].trim() : message.trim();
    }
  }
  return null;
}

// ─── Formata resultado para injeção no Gemini ─────────────────────────────────

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
**Status:** ${status}
**Preço:** ${result.priceFormatted}
**Categoria:** ${result.category}
**Link direto:** ${result.link}
${result.description ? `**Descrição:** ${result.description}` : ""}

INSTRUÇÃO: Informe o cliente sobre este produto. Se disponível, envie o link acima de forma natural na conversa. Se o cliente quiser comprar ou tiver mais dúvidas, encaminhe ao comercial.`;
}
