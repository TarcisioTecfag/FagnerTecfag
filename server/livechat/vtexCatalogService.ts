/**
 * server/livechat/vtexCatalogService.ts
 *
 * Serviço de consulta ao catálogo VTEX para o Fagner.
 * Busca as especificações completas de um produto pelo slug da URL
 * e retorna dados estruturados para o Gemini usar como contexto.
 *
 * Endpoint público (não requer autenticação para leitura):
 *   GET /api/catalog_system/pub/products/search?fq=linkId:SLUG&_from=0&_to=0
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const VTEX_ACCOUNT  = process.env.VTEX_ACCOUNT_NAME || "tecfag";
const VTEX_API_BASE = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;

// Headers opcionais para leitura (chaves de API aumentam rate-limit mas não são obrigatórias)
function catalogHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.VTEX_APP_KEY && process.env.VTEX_APP_TOKEN) {
    h["X-VTEX-API-AppKey"]   = process.env.VTEX_APP_KEY;
    h["X-VTEX-API-AppToken"] = process.env.VTEX_APP_TOKEN;
  }
  return h;
}

// ─── Tipos Públicos ───────────────────────────────────────────────────────────

export interface VtexProductSpec {
  name: string;
  values: string[];
}

export interface VtexProductInfo {
  productId:    string;
  productName:  string;
  description:  string;          // texto puro (HTML removido)
  brand:        string;
  categoryPath: string;
  linkText:     string;          // slug canônico da VTEX
  productUrl:   string;          // URL canônica completa
  specs:        VtexProductSpec[];
  priceMin:     number | null;   // centavos
  priceMax:     number | null;   // centavos
  priceFormatted: string;        // "R$ X.XXX,00" ou "Consultar"
  available:    boolean;
  skuId:        string | null;   // ID numérico do primeiro SKU disponível (para checkout)
  refId:        string | null;   // Código de referência do produto (ex: FX800C)
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Remove tags HTML deixando apenas texto puro */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Formata preço em centavos para Real brasileiro */
function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Extrai specs de specificationGroups (formato novo da VTEX) */
function extractSpecs(product: any): VtexProductSpec[] {
  const specs: VtexProductSpec[] = [];

  // Tenta specificationGroups primeiro (mais detalhado)
  if (Array.isArray(product.specificationGroups)) {
    for (const group of product.specificationGroups) {
      if (!Array.isArray(group.specifications)) continue;
      for (const spec of group.specifications) {
        if (spec.name && Array.isArray(spec.values) && spec.values.length > 0) {
          specs.push({ name: spec.name, values: spec.values });
        }
      }
    }
  }

  // Fallback: propriedades allSpecifications (formato legado)
  if (specs.length === 0 && Array.isArray(product.allSpecifications)) {
    for (const specName of product.allSpecifications) {
      const values = product[specName];
      if (values) {
        specs.push({
          name: specName,
          values: Array.isArray(values) ? values : [String(values)],
        });
      }
    }
  }

  return specs;
}

/** Extrai preço e skuId do primeiro SKU disponível */
function extractPrice(product: any): { min: number | null; max: number | null; available: boolean; skuId: string | null; refId: string | null } {
  let min: number | null = null;
  let max: number | null = null;
  let available = false;
  let skuId: string | null = null;
  let refId: string | null = null;

  const items: any[] = product.items ?? [];
  for (const item of items) {
    const sellers: any[] = item.sellers ?? [];
    for (const seller of sellers) {
      const offer = seller.commertialOffer;
      if (!offer) continue;
      const price: number = offer.Price ?? 0;
      const qty: number   = offer.AvailableQuantity ?? 0;
      if (price > 0) {
        if (min === null || price < min) min = price * 100; // → centavos
        if (max === null || price > max) max = price * 100;
        if (qty > 0) {
          available = true;
          // Captura skuId e refId do primeiro item disponível
          if (!skuId) {
            skuId = item.itemId ?? null;         // ID numérico VTEX (ex: "12345")
            refId = item.referenceId?.[0]?.Value // Código de referência (ex: "FX800C")
              ?? item.ean
              ?? null;
          }
        }
      }
    }
  }

  // Fallback: usa o primeiro item mesmo que sem estoque
  if (!skuId && items.length > 0) {
    skuId = items[0].itemId ?? null;
    refId = items[0].referenceId?.[0]?.Value ?? items[0].ean ?? null;
  }

  return { min, max, available, skuId, refId };
}

// ─── Função Principal ─────────────────────────────────────────────────────────

/**
 * Busca produto pelo slug da URL VTEX.
 * Slug é o trecho entre o último "/" e "/p" na URL do produto.
 *
 * Exemplos:
 *   "tunel-de-encolhimento-shrink---bs6535la"
 *   "seladora-a-vacuo-sv500"
 */
export async function getProductBySlug(slug: string): Promise<VtexProductInfo | null> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  // Remove sufixos de SKU (---BS6535LA) para busca mais ampla
  const baseSlug = cleanSlug.replace(/---[^-]+$/, "");

  // Tenta primeiro com slug completo, depois com slug base
  const slugsToTry = Array.from(new Set([cleanSlug, baseSlug]));

  for (const s of slugsToTry) {
    try {
      const url = `${VTEX_API_BASE}/api/catalog_system/pub/products/search?fq=linkId:${encodeURIComponent(s)}&_from=0&_to=0`;
      console.log(`[VTEX Catalog] 🔍 Buscando produto: ${url}`);

      const res = await fetch(url, {
        headers: catalogHeaders(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[VTEX Catalog] HTTP ${res.status} para slug "${s}"`);
        continue;
      }

      const products: any[] = await res.json();
      if (!Array.isArray(products) || products.length === 0) {
        console.warn(`[VTEX Catalog] Nenhum produto encontrado para slug "${s}"`);
        continue;
      }

      const p = products[0];

      // Extrai dados
      const specs       = extractSpecs(p);
      const pricing     = extractPrice(p);
      const description = stripHtml(p.description ?? p.metaTagDescription ?? "");
      const catNames    = (p.categories ?? []).map((c: string) => c.replace(/\//g, "").trim()).filter(Boolean);

      let priceFormatted = "Consultar";
      if (pricing.min !== null) {
        priceFormatted = pricing.min === pricing.max || pricing.max === null
          ? formatBRL(pricing.min)
          : `${formatBRL(pricing.min)} – ${formatBRL(pricing.max!)}`;
      }

      const info: VtexProductInfo = {
        productId:    p.productId ?? "",
        productName:  p.productName ?? p.productTitle ?? slug,
        description,
        brand:        p.brand ?? "",
        categoryPath: catNames.join(" > "),
        linkText:     p.linkText ?? cleanSlug,
        productUrl:   `https://www.tecfag.com.br/${p.linkText ?? cleanSlug}/p`,
        specs,
        priceMin:     pricing.min,
        priceMax:     pricing.max,
        priceFormatted,
        available:    pricing.available,
        skuId:        pricing.skuId,
        refId:        pricing.refId,
      };

      console.log(`[VTEX Catalog] ✅ Produto encontrado: "${info.productName}" — ${specs.length} specs`);
      return info;

    } catch (err: any) {
      console.warn(`[VTEX Catalog] Erro ao buscar slug "${s}":`, err.message);
    }
  }

  return null;
}

/**
 * Formata as informações do produto como texto para injetar no contexto do Gemini.
 */
export function formatProductContextForAI(info: VtexProductInfo): string {
  const lines: string[] = [
    `Nome do Produto: ${info.productName}`,
  ];

  if (info.brand)        lines.push(`Marca/Fabricante: ${info.brand}`);
  if (info.categoryPath) lines.push(`Categoria: ${info.categoryPath}`);
  lines.push(`Preço: ${info.priceFormatted}`);
  lines.push(`Disponibilidade: ${info.available ? "Em estoque" : "Consultar disponibilidade"}`);
  lines.push(`URL: ${info.productUrl}`);

  if (info.description) {
    lines.push(`\nDescrição:\n${info.description}`);
  }

  // SKU ID numérico para o checkout — OBRIGATÓRIO para o campo skuId no [VTEX_ORDER_DADOS]
  if (info.skuId) {
    lines.push(`\nSKU ID (para pedido): ${info.skuId}`);
  }
  if (info.refId) {
    lines.push(`Código de referência: ${info.refId}`);
  }

  if (info.specs.length > 0) {
    lines.push("\nEspecificações Técnicas:");
    for (const spec of info.specs) {
      lines.push(`  • ${spec.name}: ${spec.values.join(", ")}`);
    }
  }

  return lines.join("\n");
}
